/**
 * Gaussian-kernel proper scoring rule for painted geographic distributions.
 * Shown here with a single Gaussian; games score with DEFAULT_KERNEL, a
 * mixture of Gaussians at r, 4r and 16r (see Kernel).
 *
 *   k(a,b) = 2^-(d(a,b)/r)^2        d = chord distance on the Earth sphere, km
 *   A = sum_i p_i k(x_i, y)
 *   B = sum_i sum_j p_i p_j k(x_i, x_j)
 *   score = 500 (1 + 2A - B)
 *
 * The distribution may include a "uniform floor": a fraction `floor` of the
 * mass spread evenly over the whole sphere. Its kernel integrals have a closed
 * form (see uniformKernelMean), so it costs nothing to evaluate.
 */
import {
  cellAreaKm2,
  cellToChildren,
  cellToLatLng,
  cellToParent,
  finerRes,
  getResolution,
  type H3Cell,
  type H3Res
} from "../h3.ts"
import { CUTOFF_WIDTHS, crossSum, kernelFromSq, pairSum, patchWidthSq } from "./kernel-sums.ts"
import { z } from "zod"
import { EARTH_RADIUS, chordDistanceSq, toXyz, type LatLon, type Xyz } from "../geo.ts"
import type { Degrees, Km, Points, SquareKm } from "../units.ts"

const LN2 = Math.LN2

/**
 * A kernel is a positive mixture of Gaussians. Each component has width
 * `scale * tolerance`; weights sum to 1. A single Gaussian is scales [1].
 * Any positive mixture of Gaussians is still positive definite, so the scoring
 * rule stays proper and bounded for every kernel here.
 */
export interface Kernel {
  id: string
  label: string
  scales: number[]
  weights: number[]
}

/** The kernels a game or practice may score with. */
export enum KernelId {
  SINGLE = "SINGLE",
  MULTI_EQUAL = "MULTI_EQUAL",
  MULTI_WEIGHTED = "MULTI_WEIGHTED"
}
export const KernelIdSchema = z.enum(KernelId)
export type ChoosableKernel = Kernel & { id: KernelId }

export const SINGLE_KERNEL: ChoosableKernel = {
  id: KernelId.SINGLE,
  label: "Single Gaussian (r)",
  scales: [1],
  weights: [1]
}

export const KERNELS: ChoosableKernel[] = [
  SINGLE_KERNEL,
  { id: KernelId.MULTI_EQUAL, label: "Mixture r, 4r, 16r (equal)", scales: [1, 4, 16], weights: [1 / 3, 1 / 3, 1 / 3] },
  {
    id: KernelId.MULTI_WEIGHTED,
    label: "Mixture r, 4r, 16r (0.5 / 0.3 / 0.2)",
    scales: [1, 4, 16],
    weights: [0.5, 0.3, 0.2]
  }
]

/** The kernel games and practice score with; the others are for comparison in the dev drawer. */
export const DEFAULT_KERNEL: ChoosableKernel = KERNELS[1]!

export function kernelById(id: KernelId): ChoosableKernel {
  return KERNELS.find((k) => k.id === id)!
}

export interface WeightedPoint {
  xyz: Xyz
  /** Probability mass. The painted points' masses plus `floor` must sum to 1. */
  p: number
  /**
   * Spatial variance per axis of the patch this mass is spread over
   * (0 or absent for a point mass). A painted cell is a patch, not a point:
   * treating it as a Gaussian blob of matching second moment makes the score
   * independent of the resolution it was painted at. See patchGaussFromSq.
   */
  s2?: SquareKm
  /** H3 index of the cell, when the mass is a painted cell; lets A refine it. */
  cell?: H3Cell
}

/**
 * Per-axis variance of a regular hexagon of area A: (5/24) R² with
 * R² = 2A / (3√3). A disc of the same area gives A / 4π; the two agree to 1%.
 */
const HEX_VARIANCE_PER_AREA = 5 / (36 * Math.sqrt(3))

export interface Distribution {
  points: WeightedPoint[]
  /** Fraction of total mass spread uniformly over the sphere, in [0, 1]. */
  floor: number
}

export interface ScoreBreakdown {
  score: Points
  A: number
  B: number
}

export function kernel(distance: Km, tolerance: Km, k: Kernel = DEFAULT_KERNEL): number {
  return kernelFromSq(distance * distance, tolerance, k)
}

/**
 * Mean of k(x, y) over x uniformly distributed on the sphere. Independent of y.
 * Also equals the double integral of k over two independent uniform points.
 *
 * With t = 1 - cos(theta) and a = 2 R^2 ln2 / r^2, k = exp(-a t) and the
 * uniform measure in t is dt/2 on [0, 2], giving (1 - e^{-2a}) / (2a).
 */
export function uniformKernelMean(tolerance: Km, k: Kernel = DEFAULT_KERNEL): number {
  let v = 0
  for (let i = 0; i < k.scales.length; i++) {
    v += k.weights[i]! * gaussUniformMean(k.scales[i]! * tolerance)
  }
  return v
}

function gaussUniformMean(width: Km): number {
  const a = (2 * EARTH_RADIUS * EARTH_RADIUS * LN2) / (width * width)
  return (1 - Math.exp(-2 * a)) / (2 * a)
}

/**
 * A Gaussian patch stands in well for a hexagon only when the kernel is not
 * much narrower than the cell: a narrow kernel sees the patch's peaked centre
 * and thin edges rather than the hexagon's flat top. Cells whose spread
 * exceeds this fraction of the tolerance are split into children for the A
 * term, but only where they can matter: within the kernel's reach of the
 * answer. Far cells contribute nothing either way. B is far less sensitive
 * (a Gaussian and a hexagon of equal area have the same self-overlap to 1%),
 * so it uses the patch form throughout.
 */
const REFINE_ABOVE = 0.4

/** A(y) = expected similarity to the answer y. */
export function similarityToAnswer(
  painted: Distribution,
  answer: Xyz,
  tolerance: Km,
  k: Kernel = DEFAULT_KERNEL
): number {
  let A = 0
  const widest = tolerance * Math.max(...k.scales)
  for (const pt of painted.points) {
    A += patchSimilarity(pt, answer, tolerance, widest, k)
  }
  A += painted.floor * uniformKernelMean(tolerance, k)
  return A
}

function patchSimilarity(pt: WeightedPoint, answer: Xyz, tolerance: Km, widest: Km, k: Kernel): number {
  const s2 = pt.s2 ?? 0
  const dSq = chordDistanceSq(pt.xyz, answer)
  if (!pt.cell || s2 <= (REFINE_ABOVE * tolerance) ** 2) return pt.p * kernelFromSq(dSq, tolerance, k, s2)
  // Circumradius from the variance (R² = 24 s² / 5), then the reach of the widest component.
  const R = Math.sqrt(4.8 * s2)
  const reach = CUTOFF_WIDTHS * Math.sqrt(patchWidthSq(widest, s2))
  if (Math.sqrt(dSq) - R > reach) return pt.p * kernelFromSq(dSq, tolerance, k, s2)
  const res = getResolution(pt.cell)
  if (res >= 15) return pt.p * kernelFromSq(dSq, tolerance, k, s2)
  const children = cellToChildren(pt.cell, finerRes(res))
  const areas = children.map((c) => cellAreaKm2(c))
  const total = areas.reduce((s, a) => s + a, 0)
  let A = 0
  for (let i = 0; i < children.length; i++) {
    const [lat, lon] = cellToLatLng(children[i]!)
    const child: WeightedPoint = {
      xyz: toXyz({ lat, lon }),
      p: (pt.p * areas[i]!) / total,
      s2: HEX_VARIANCE_PER_AREA * areas[i]!,
      cell: children[i]!
    }
    A += patchSimilarity(child, answer, tolerance, widest, k)
  }
  return A
}

/** B = expected self-similarity of the distribution. Does not depend on the answer. */
export function selfSimilarity(
  painted: Distribution,
  tolerance: Km,
  exact = false,
  k: Kernel = DEFAULT_KERNEL
): number {
  const K = uniformKernelMean(tolerance, k)
  const paintedMass = 1 - painted.floor
  let B = pairSum(painted.points, tolerance, exact, k)
  // Cross terms between painted mass and the uniform floor, and floor with itself.
  B += 2 * painted.floor * paintedMass * K
  B += painted.floor * painted.floor * K
  return B
}

export function scoreFromParts(A: number, B: number): Points {
  return 500 * (1 + 2 * A - B)
}

/**
 * What a pass scores: Done with nothing painted, or a blank map when the clock
 * runs out. Half the ~500 that spreading paint evenly over the world earns, so
 * even the vaguest honest guess beats passing, yet far above the ~0 of a
 * confident guess in the wrong place. Reported as A = 0, B = 0.5 so the parts
 * still add up to the score.
 */
export const PASS_SCORE: ScoreBreakdown = { score: 250, A: 0, B: 0.5 }

export function scoreDistribution(
  painted: Distribution,
  answer: LatLon,
  tolerance: Km,
  k: Kernel = DEFAULT_KERNEL,
  exact = false
): ScoreBreakdown {
  const A = similarityToAnswer(painted, toXyz(answer), tolerance, k)
  const B = selfSimilarity(painted, tolerance, exact, k)
  return { score: scoreFromParts(A, B), A, B }
}

// ---- region answers ---------------------------------------------------------
//
// A region question ("Paint Germany") has a distribution as its answer: q,
// the region's cells spread evenly by area. The score generalises the point
// rule, 1000 - 500 ||p - y||^2, to 1000 - 500 ||p - q||^2 / <q,q>, taken for
// each Gaussian component c of the kernel on its own and then weighted:
//
//   A_c = <p,q>_c = sum_i sum_j p_i q_j k_c(x_i, y_j)   (the point A, averaged over q)
//   B_c = <p,p>_c                                       (unchanged)
//   Q_c = <q,q>_c                                       (a constant per question)
//   score = sum_c w_c max(0, 1000 - 500 (B_c - 2 A_c + Q_c) / Q_c)
//
// A point is a region with every Q_c = 1, where this is exactly
// scoreFromParts. The division by Q_c is what keeps a large region on the
// same scale: ||p - q||^2 shrinks when both are spread wide against the
// kernel, so without it an even paint of the whole world would score near
// 1000 for Russia. It is a fixed rescale per question and component, so the
// rule stays proper. Each component is divided by its own Q_c: a wide one
// sees the country as a compact blob and has Q_c near 1, so dividing the
// total by the total Q let even a small wide weight swamp the narrow one and
// forgive leaving much of the country out. Scores below 0 (a confident guess
// far off, possible now that Q_c < 1) are clamped.

export interface RegionAnswer {
  /** The region's cells as patches, masses summing to 1. */
  points: WeightedPoint[]
  /** <q,q> for each component of the kernel, at the tolerance it was built for. */
  Q: number[]
  tolerance: Km
  kernel: Kernel
}

export interface RegionScore extends ScoreBreakdown {
  /** <q,q>, weighted over the components like A and B. */
  Q: number
}

/** One Gaussian component of a kernel, as a kernel of its own. */
function component(k: Kernel, c: number): Kernel {
  return { id: `${k.id}#${c}`, label: k.label, scales: [k.scales[c]!], weights: [1] }
}

/** Region answer from H3 cells (any mix of resolutions), weighted by area. */
export function regionAnswer(cells: Iterable<H3Cell>, tolerance: Km, k: Kernel = DEFAULT_KERNEL): RegionAnswer {
  const raw: WeightedPoint[] = []
  let total = 0
  for (const h of cells) {
    const area = cellAreaKm2(h)
    const [lat, lon] = cellToLatLng(h)
    raw.push({ xyz: toXyz({ lat, lon }), p: area, s2: HEX_VARIANCE_PER_AREA * area, cell: h })
    total += area
  }
  const points = raw.map((pt) => ({ ...pt, p: pt.p / total }))
  const Q = k.scales.map((_, c) => pairSum(points, tolerance, false, component(k, c)))
  return { points, Q, tolerance, kernel: k }
}

/**
 * Merge painted cells finer than `res` into their parents at `res`, keeping
 * their mass; coarser cells are left alone. Cells are scored as patches, so
 * this changes scores only slightly while cutting the work sharply.
 */
export function coarsenDistribution(painted: Distribution, res: H3Res): Distribution {
  const merged = new Map<H3Cell, number>()
  const points: WeightedPoint[] = []
  for (const pt of painted.points) {
    if (!pt.cell || getResolution(pt.cell) <= res) points.push(pt)
    else {
      const parent = cellToParent(pt.cell, res)
      merged.set(parent, (merged.get(parent) ?? 0) + pt.p)
    }
  }
  for (const [h, p] of merged) {
    const [lat, lon] = cellToLatLng(h)
    points.push({ xyz: toXyz({ lat, lon }), p, s2: HEX_VARIANCE_PER_AREA * cellAreaKm2(h), cell: h })
  }
  return { points, floor: painted.floor }
}

export function scoreRegion(painted: Distribution, region: RegionAnswer, exact = false): RegionScore {
  const { tolerance, kernel: k } = region
  let score = 0
  let A = 0
  let B = 0
  let Q = 0
  for (let c = 0; c < k.scales.length; c++) {
    const kc = component(k, c)
    const Qc = region.Q[c]!
    // The floor against q: the uniform kernel mean is the same from every point.
    const Ac =
      crossSum(painted.points, region.points, tolerance, exact, kc) + painted.floor * uniformKernelMean(tolerance, kc)
    const Bc = selfSimilarity(painted, tolerance, exact, kc)
    const w = k.weights[c]!
    score += w * Math.max(0, 1000 - (500 * (Bc - 2 * Ac + Qc)) / Qc)
    A += w * Ac
    B += w * Bc
    Q += w * Qc
  }
  return { score, A, B, Q }
}

/**
 * Build a normalised Distribution from raw painted cells.
 * `intensity` is paint density; `area` is the cell's real area, so mass is
 * proportional to intensity x area. `floor` is the requested uniform fraction.
 */
export function buildDistribution(
  cells: Iterable<{ lat: Degrees; lon: Degrees; intensity: number; area: SquareKm; h3?: H3Cell }>,
  floor: number
): Distribution {
  const raw: { xyz: Xyz; w: number; s2: SquareKm; cell?: H3Cell }[] = []
  let total = 0
  for (const c of cells) {
    if (c.intensity <= 0) continue
    const w = c.intensity * c.area
    total += w
    raw.push({ xyz: toXyz(c), w, s2: HEX_VARIANCE_PER_AREA * c.area, cell: c.h3 })
  }
  if (raw.length === 0) {
    // Nothing painted: everything is floor, regardless of the slider.
    return { points: [], floor: 1 }
  }
  const f = Math.min(1, Math.max(0, floor))
  const painted = 1 - f
  return {
    points: raw.map((r) => ({ xyz: r.xyz, p: (painted * r.w) / total, s2: r.s2, cell: r.cell })),
    floor: f
  }
}
