import { chordDistanceSq } from "./geo.ts"
import type { Kernel, WeightedPoint } from "./scoring.ts"
import type { Km, SquareKm } from "./units.ts"

const LN2 = Math.LN2

function gaussFromSq(distSq: SquareKm, width: Km): number {
  return Math.exp((-LN2 * distSq) / (width * width))
}

/**
 * Gaussian kernel of width w between two Gaussian patches whose per-axis
 * variances sum to s2 (km²). k = 2^-(d/w)² is a Gaussian with variance
 * σ² = w² / (2 ln2) per axis; integrating it against the two patches gives
 * another Gaussian in the centre distance, with variance σ² + s2 and, in two
 * dimensions, amplitude σ² / (σ² + s2). In terms of the width: the effective
 * width squared is w² + 2 ln2 s2 and the amplitude is w² / w'². Flat-plane
 * result; exact enough for cells small against the Earth's radius.
 */
export function patchWidthSq(width: Km, s2: SquareKm): number {
  return width * width + 2 * LN2 * s2
}

function patchGaussFromSq(distSq: SquareKm, width: Km, s2: SquareKm): number {
  if (s2 === 0) return gaussFromSq(distSq, width)
  const w2 = width * width
  const eff = patchWidthSq(width, s2)
  return (w2 / eff) * Math.exp((-LN2 * distSq) / eff)
}

export function kernelFromSq(distSq: SquareKm, tolerance: Km, k: Kernel, s2 = 0): number {
  let v = 0
  for (let i = 0; i < k.scales.length; i++) {
    v += k.weights[i]! * patchGaussFromSq(distSq, k.scales[i]! * tolerance, s2)
  }
  return v
}

/** Beyond this many widths a Gaussian is below 2^-16 and is ignored in B. */
export const CUTOFF_WIDTHS = 4

interface PatchGroup {
  s2: SquareKm
  points: WeightedPoint[]
}

/**
 * Sum over pairs p_i p_j k(x_i, x_j) among the painted points, including
 * self-pairs. Each Gaussian component is summed separately. Points are grouped
 * by patch size, since the effective kernel between two patches depends on
 * both sizes; every pair of groups is summed with its own width. For
 * effective widths wider than the tolerance the points are first aggregated
 * onto a 3D grid an eighth of that width, which keeps the cost bounded when
 * the cutoff spans the globe while displacing mass by far less than the width.
 */
export function pairSum(points: WeightedPoint[], tolerance: Km, exact: boolean, k: Kernel): number {
  if (exact) return exactCrossSum(points, points, tolerance, k)
  const groups = groupByPatchSize(points)
  let total = 0
  for (let c = 0; c < k.scales.length; c++) {
    const width = k.scales[c]! * tolerance
    for (let a = 0; a < groups.length; a++) {
      for (let b = a; b < groups.length; b++) {
        const { amplitude, sum } = groupGaussSum(groups[a]!, a === b ? undefined : groups[b]!, width, tolerance)
        total += k.weights[c]! * amplitude * (a === b ? sum : 2 * sum)
      }
    }
  }
  return total
}

/**
 * Sum over i in `left`, j in `right` of p_i p_j k(x_i, y_j) between two sets
 * of patches, grouped by patch size and aggregated for wide components as in
 * pairSum.
 */
export function crossSum(
  left: WeightedPoint[],
  right: WeightedPoint[],
  tolerance: Km,
  exact: boolean,
  k: Kernel
): number {
  if (exact) return exactCrossSum(left, right, tolerance, k)
  const leftGroups = groupByPatchSize(left)
  const rightGroups = groupByPatchSize(right)
  let total = 0
  for (let c = 0; c < k.scales.length; c++) {
    const width = k.scales[c]! * tolerance
    for (const ga of leftGroups) {
      for (const gb of rightGroups) {
        const { amplitude, sum } = groupGaussSum(ga, gb, width, tolerance)
        total += k.weights[c]! * amplitude * sum
      }
    }
  }
  return total
}

function exactCrossSum(left: WeightedPoint[], right: WeightedPoint[], tolerance: Km, k: Kernel): number {
  let total = 0
  for (const a of left) {
    for (const b of right) {
      total += a.p * b.p * kernelFromSq(chordDistanceSq(a.xyz, b.xyz), tolerance, k, (a.s2 ?? 0) + (b.s2 ?? 0))
    }
  }
  return total
}

/**
 * Truncated Gaussian sum between two groups at their effective width, aggregated when that width is wide.
 * An undefined `gb` pairs `ga` with itself.
 */
function groupGaussSum(
  ga: PatchGroup,
  gb: PatchGroup | undefined,
  width: Km,
  tolerance: Km
): { amplitude: number; sum: number } {
  const eff = Math.sqrt(patchWidthSq(width, ga.s2 + (gb ?? ga).s2))
  // Same rule as before patches: components at least twice the tolerance wide are aggregated.
  const coarse = eff >= 2 * tolerance
  const pa = coarse ? aggregate(ga.points, eff / 8) : ga.points
  const pb = gb === undefined ? pa : coarse ? aggregate(gb.points, eff / 8) : gb.points
  return { amplitude: (width * width) / (eff * eff), sum: gaussCrossSum(pa, pb, eff) }
}

function groupByPatchSize(points: WeightedPoint[]): PatchGroup[] {
  const groups = new Map<number, WeightedPoint[]>()
  for (const pt of points) {
    // Cells of one H3 resolution differ slightly in area; bucket them together.
    const key = pt.s2 ? Math.round(Math.log2(pt.s2) * 2) : -Infinity
    const list = groups.get(key)
    if (list) list.push(pt)
    else groups.set(key, [pt])
  }
  return [...groups.values()].map((pts) => {
    let mass = 0
    let s2 = 0
    for (const pt of pts) {
      mass += pt.p
      s2 += pt.p * (pt.s2 ?? 0)
    }
    return { s2: mass > 0 ? s2 / mass : 0, points: pts }
  })
}

/** Merge points into mass-weighted centroids on a 3D grid of cubes `side` across. */
function aggregate(points: WeightedPoint[], side: Km): WeightedPoint[] {
  const acc = new Map<string, { x: number; y: number; z: number; p: number }>()
  for (const pt of points) {
    const [x, y, z] = pt.xyz
    const key = `${Math.floor(x / side)},${Math.floor(y / side)},${Math.floor(z / side)}`
    const a = acc.get(key)
    if (a) {
      a.x += pt.p * x
      a.y += pt.p * y
      a.z += pt.p * z
      a.p += pt.p
    } else {
      acc.set(key, { x: pt.p * x, y: pt.p * y, z: pt.p * z, p: pt.p })
    }
  }
  const out: WeightedPoint[] = []
  for (const a of acc.values()) {
    if (a.p <= 0) continue
    out.push({ xyz: [a.x / a.p, a.y / a.p, a.z / a.p], p: a.p })
  }
  return out
}

// Coordinates are within +-6371 km, so offsetting by 8192 keeps indices positive.
const OFF = 8192

/**
 * `right` hashed into cubes one cutoff wide. Flat typed arrays and integer
 * bucket keys: this is the hot path for the live score, so avoid per-pair
 * allocation and string hashing.
 */
interface CutoffGrid {
  /** Bucket key to indices into the columns, ascending. */
  buckets: Map<number, number[]>
  xs: Float64Array
  ys: Float64Array
  zs: Float64Array
  ps: Float64Array
  inv: number
  span: number
  cutoffSq: number
  expScale: number
}

function cellIndex(g: CutoffGrid, v: number): number {
  return Math.floor((v + OFF) * g.inv)
}

function bucketKey(g: CutoffGrid, bx: number, by: number, bz: number): number {
  return (bx * g.span + by) * g.span + bz
}

function cutoffGrid(right: WeightedPoint[], width: Km): CutoffGrid {
  const n = right.length
  const cutoff = CUTOFF_WIDTHS * width
  const inv = 1 / cutoff
  const g: CutoffGrid = {
    buckets: new Map(),
    xs: new Float64Array(n),
    ys: new Float64Array(n),
    zs: new Float64Array(n),
    ps: new Float64Array(n),
    inv,
    span: Math.ceil(2 * OFF * inv) + 2,
    cutoffSq: cutoff * cutoff,
    expScale: -LN2 / (width * width)
  }
  for (let i = 0; i < n; i++) {
    const pt = right[i]!
    g.xs[i] = pt.xyz[0]
    g.ys[i] = pt.xyz[1]
    g.zs[i] = pt.xyz[2]
    g.ps[i] = pt.p
    const key = bucketKey(g, cellIndex(g, g.xs[i]!), cellIndex(g, g.ys[i]!), cellIndex(g, g.zs[i]!))
    const list = g.buckets.get(key)
    if (list) list.push(i)
    else g.buckets.set(key, [i])
  }
  return g
}

/** Adds `pt` against every point in its own and the 26 neighbouring buckets. */
function addNeighbours(total: number, pt: WeightedPoint, g: CutoffGrid): number {
  const bx = cellIndex(g, pt.xyz[0])
  const by = cellIndex(g, pt.xyz[1])
  const bz = cellIndex(g, pt.xyz[2])
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = g.buckets.get(bucketKey(g, bx + dx, by + dy, bz + dz))
        if (list) total = addBucket(total, list, pt, g)
      }
    }
  }
  return total
}

function addBucket(total: number, list: number[], pt: WeightedPoint, g: CutoffGrid): number {
  const xi = pt.xyz[0],
    yi = pt.xyz[1],
    zi = pt.xyz[2],
    pi = pt.p
  for (const j of list) {
    const ddx = xi - g.xs[j]!,
      ddy = yi - g.ys[j]!,
      ddz = zi - g.zs[j]!
    const dsq = ddx * ddx + ddy * ddy + ddz * ddz
    if (dsq > g.cutoffSq) continue
    total += pi * g.ps[j]! * Math.exp(g.expScale * dsq)
  }
  return total
}

/**
 * Truncated sum over i in `left`, j in `right` of p_i p_j exp(-ln2 d²/w²),
 * using a 3D grid hash of `right` with cells one cutoff wide so each point
 * only visits its 27 neighbouring buckets. When both sides are the same
 * array this is the self pair sum.
 */
function gaussCrossSum(left: WeightedPoint[], right: WeightedPoint[], width: Km): number {
  if (right.length === 0 || left.length === 0) return 0
  const g = cutoffGrid(right, width)
  let total = 0
  for (const pt of left) total = addNeighbours(total, pt, g)
  return total
}
