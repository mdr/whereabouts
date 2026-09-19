/**
 * Gaussian-kernel proper scoring rule for painted geographic distributions.
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
import { cellArea, cellToChildren, cellToLatLng, getResolution, UNITS } from "h3-js";
import { EARTH_RADIUS_KM, chordDistanceSq, toXyz, type LatLon, type Xyz } from "./geo.ts";

const LN2 = Math.LN2;

/**
 * A kernel is a positive mixture of Gaussians. Each component has width
 * `scale * tolerance`; weights sum to 1. A single Gaussian is scales [1].
 * Any positive mixture of Gaussians is still positive definite, so the scoring
 * rule stays proper and bounded for every kernel here.
 */
export interface Kernel {
  id: string;
  label: string;
  scales: number[];
  weights: number[];
}

export const SINGLE_KERNEL: Kernel = { id: "single", label: "Single Gaussian (r)", scales: [1], weights: [1] };

export const KERNELS: Kernel[] = [
  SINGLE_KERNEL,
  { id: "multi-equal", label: "Mixture r, 4r, 16r (equal)", scales: [1, 4, 16], weights: [1 / 3, 1 / 3, 1 / 3] },
  { id: "multi-weighted", label: "Mixture r, 4r, 16r (0.5 / 0.3 / 0.2)", scales: [1, 4, 16], weights: [0.5, 0.3, 0.2] },
];

export function kernelById(id: string): Kernel {
  return KERNELS.find((k) => k.id === id) ?? SINGLE_KERNEL;
}

export interface WeightedPoint {
  xyz: Xyz;
  /** Probability mass. The painted points' masses plus `floor` must sum to 1. */
  p: number;
  /**
   * Spatial variance per axis, km², of the patch this mass is spread over
   * (0 or absent for a point mass). A painted cell is a patch, not a point:
   * treating it as a Gaussian blob of matching second moment makes the score
   * independent of the resolution it was painted at. See patchGaussFromSq.
   */
  s2?: number;
  /** H3 index of the cell, when the mass is a painted cell; lets A refine it. */
  cell?: string;
}

/**
 * Per-axis variance of a regular hexagon of area A: (5/24) R² with
 * R² = 2A / (3√3). A disc of the same area gives A / 4π; the two agree to 1%.
 */
export const HEX_VARIANCE_PER_AREA = 5 / (36 * Math.sqrt(3));

export interface Distribution {
  points: WeightedPoint[];
  /** Fraction of total mass spread uniformly over the sphere, in [0, 1]. */
  floor: number;
}

export interface ScoreBreakdown {
  score: number;
  A: number;
  B: number;
}

export function kernel(distanceKm: number, toleranceKm: number, k: Kernel = SINGLE_KERNEL): number {
  return kernelFromSq(distanceKm * distanceKm, toleranceKm, k);
}

function gaussFromSq(distSqKm: number, widthKm: number): number {
  return Math.exp((-LN2 * distSqKm) / (widthKm * widthKm));
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
function patchWidthSq(widthKm: number, s2: number): number {
  return widthKm * widthKm + 2 * LN2 * s2;
}

function patchGaussFromSq(distSqKm: number, widthKm: number, s2: number): number {
  if (s2 === 0) return gaussFromSq(distSqKm, widthKm);
  const w2 = widthKm * widthKm;
  const eff = patchWidthSq(widthKm, s2);
  return (w2 / eff) * Math.exp((-LN2 * distSqKm) / eff);
}

function kernelFromSq(distSqKm: number, toleranceKm: number, k: Kernel, s2 = 0): number {
  let v = 0;
  for (let i = 0; i < k.scales.length; i++) {
    v += k.weights[i]! * patchGaussFromSq(distSqKm, k.scales[i]! * toleranceKm, s2);
  }
  return v;
}

/**
 * Mean of k(x, y) over x uniformly distributed on the sphere. Independent of y.
 * Also equals the double integral of k over two independent uniform points.
 *
 * With t = 1 - cos(theta) and a = 2 R^2 ln2 / r^2, k = exp(-a t) and the
 * uniform measure in t is dt/2 on [0, 2], giving (1 - e^{-2a}) / (2a).
 */
export function uniformKernelMean(toleranceKm: number, k: Kernel = SINGLE_KERNEL): number {
  let v = 0;
  for (let i = 0; i < k.scales.length; i++) {
    v += k.weights[i]! * gaussUniformMean(k.scales[i]! * toleranceKm);
  }
  return v;
}

function gaussUniformMean(widthKm: number): number {
  const a = (2 * EARTH_RADIUS_KM * EARTH_RADIUS_KM * LN2) / (widthKm * widthKm);
  return (1 - Math.exp(-2 * a)) / (2 * a);
}

/** Beyond this many widths a Gaussian is below 2^-16 and is ignored in B. */
const CUTOFF_WIDTHS = 4;

/**
 * Sum over pairs p_i p_j k(x_i, x_j) among the painted points, including
 * self-pairs. Each Gaussian component is summed separately. Points are grouped
 * by patch size, since the effective kernel between two patches depends on
 * both sizes; every pair of groups is summed with its own width. For
 * effective widths wider than the tolerance the points are first aggregated
 * onto a 3D grid an eighth of that width, which keeps the cost bounded when
 * the cutoff spans the globe while displacing mass by far less than the width.
 */
export function pairSum(
  points: WeightedPoint[],
  toleranceKm: number,
  exact = false,
  k: Kernel = SINGLE_KERNEL,
): number {
  if (exact) return exactPairSum(points, toleranceKm, k);
  const groups = groupByPatchSize(points);
  let total = 0;
  for (let c = 0; c < k.scales.length; c++) {
    const width = k.scales[c]! * toleranceKm;
    const w2 = width * width;
    for (let a = 0; a < groups.length; a++) {
      for (let b = a; b < groups.length; b++) {
        const ga = groups[a]!;
        const gb = groups[b]!;
        const eff = Math.sqrt(patchWidthSq(width, ga.s2 + gb.s2));
        // Same rule as before patches: components at least twice the tolerance wide are aggregated.
        const coarse = eff >= 2 * toleranceKm;
        const pa = coarse ? aggregate(ga.points, eff / 8) : ga.points;
        const pb = a === b ? pa : coarse ? aggregate(gb.points, eff / 8) : gb.points;
        const sum = gaussCrossSum(pa, pb, eff);
        total += k.weights[c]! * (w2 / (eff * eff)) * (a === b ? sum : 2 * sum);
      }
    }
  }
  return total;
}

function exactPairSum(points: WeightedPoint[], toleranceKm: number, k: Kernel): number {
  let total = 0;
  for (const pi of points) {
    for (const pj of points) {
      total += pi.p * pj.p * kernelFromSq(chordDistanceSq(pi.xyz, pj.xyz), toleranceKm, k, (pi.s2 ?? 0) + (pj.s2 ?? 0));
    }
  }
  return total;
}

function groupByPatchSize(points: WeightedPoint[]): { s2: number; points: WeightedPoint[] }[] {
  const groups = new Map<number, WeightedPoint[]>();
  for (const pt of points) {
    // Cells of one H3 resolution differ slightly in area; bucket them together.
    const key = pt.s2 ? Math.round(Math.log2(pt.s2) * 2) : -Infinity;
    const list = groups.get(key);
    if (list) list.push(pt);
    else groups.set(key, [pt]);
  }
  return [...groups.values()].map((pts) => {
    let mass = 0;
    let s2 = 0;
    for (const pt of pts) {
      mass += pt.p;
      s2 += pt.p * (pt.s2 ?? 0);
    }
    return { s2: mass > 0 ? s2 / mass : 0, points: pts };
  });
}

/** Merge points into mass-weighted centroids on a 3D grid of side `gridKm`. */
function aggregate(points: WeightedPoint[], gridKm: number): WeightedPoint[] {
  const acc = new Map<string, { x: number; y: number; z: number; p: number }>();
  for (const pt of points) {
    const [x, y, z] = pt.xyz;
    const key = `${Math.floor(x / gridKm)},${Math.floor(y / gridKm)},${Math.floor(z / gridKm)}`;
    const a = acc.get(key);
    if (a) {
      a.x += pt.p * x;
      a.y += pt.p * y;
      a.z += pt.p * z;
      a.p += pt.p;
    } else {
      acc.set(key, { x: pt.p * x, y: pt.p * y, z: pt.p * z, p: pt.p });
    }
  }
  const out: WeightedPoint[] = [];
  for (const a of acc.values()) {
    if (a.p <= 0) continue;
    out.push({ xyz: [a.x / a.p, a.y / a.p, a.z / a.p], p: a.p });
  }
  return out;
}

/**
 * Truncated sum over i in `left`, j in `right` of p_i p_j exp(-ln2 d²/w²),
 * using a 3D grid hash of `right` with cells one cutoff wide so each point
 * only visits its 27 neighbouring buckets. When both sides are the same
 * array this is the self pair sum.
 */
function gaussCrossSum(left: WeightedPoint[], right: WeightedPoint[], widthKm: number): number {
  const n = right.length;
  const m = left.length;
  if (n === 0 || m === 0) return 0;
  const invW2 = -LN2 / (widthKm * widthKm);

  // Flat typed arrays and integer bucket keys: this loop is the hot path for
  // the live score, so avoid per-pair allocation and string hashing.
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const zs = new Float64Array(n);
  const ps = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const pt = right[i]!;
    xs[i] = pt.xyz[0];
    ys[i] = pt.xyz[1];
    zs[i] = pt.xyz[2];
    ps[i] = pt.p;
  }

  const cutoff = CUTOFF_WIDTHS * widthKm;
  const cutoffSq = cutoff * cutoff;
  const inv = 1 / cutoff;
  // Coordinates are within +-6371 km, so offsetting by 8192 keeps indices positive.
  const OFF = 8192;
  const SPAN = Math.ceil(2 * OFF * inv) + 2;
  const bucketOf = (x: number, y: number, z: number) =>
    (Math.floor((x + OFF) * inv) * SPAN + Math.floor((y + OFF) * inv)) * SPAN + Math.floor((z + OFF) * inv);

  const buckets = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const b = bucketOf(xs[i]!, ys[i]!, zs[i]!);
    const list = buckets.get(b);
    if (list) list.push(i);
    else buckets.set(b, [i]);
  }

  let total = 0;
  for (let i = 0; i < m; i++) {
    const li = left[i]!;
    const xi = li.xyz[0],
      yi = li.xyz[1],
      zi = li.xyz[2],
      pi = li.p;
    const bx = Math.floor((xi + OFF) * inv);
    const by = Math.floor((yi + OFF) * inv);
    const bz = Math.floor((zi + OFF) * inv);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const list = buckets.get(((bx + dx) * SPAN + (by + dy)) * SPAN + (bz + dz));
          if (!list) continue;
          for (let t = 0; t < list.length; t++) {
            const j = list[t]!;
            const ddx = xi - xs[j]!,
              ddy = yi - ys[j]!,
              ddz = zi - zs[j]!;
            const dsq = ddx * ddx + ddy * ddy + ddz * ddz;
            if (dsq > cutoffSq) continue;
            total += pi * ps[j]! * Math.exp(invW2 * dsq);
          }
        }
      }
    }
  }
  return total;
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
const REFINE_ABOVE = 0.4;

/** A(y) = expected similarity to the answer y. */
export function similarityToAnswer(
  dist: Distribution,
  answer: Xyz,
  toleranceKm: number,
  k: Kernel = SINGLE_KERNEL,
): number {
  let A = 0;
  const widest = toleranceKm * Math.max(...k.scales);
  for (const pt of dist.points) {
    A += patchSimilarity(pt, answer, toleranceKm, widest, k);
  }
  A += dist.floor * uniformKernelMean(toleranceKm, k);
  return A;
}

function patchSimilarity(pt: WeightedPoint, answer: Xyz, toleranceKm: number, widestKm: number, k: Kernel): number {
  const s2 = pt.s2 ?? 0;
  const dSq = chordDistanceSq(pt.xyz, answer);
  if (!pt.cell || s2 <= (REFINE_ABOVE * toleranceKm) ** 2) return pt.p * kernelFromSq(dSq, toleranceKm, k, s2);
  // Circumradius from the variance (R² = 24 s² / 5), then the reach of the widest component.
  const R = Math.sqrt(4.8 * s2);
  const reach = CUTOFF_WIDTHS * Math.sqrt(patchWidthSq(widestKm, s2));
  if (Math.sqrt(dSq) - R > reach) return pt.p * kernelFromSq(dSq, toleranceKm, k, s2);
  const res = getResolution(pt.cell);
  if (res >= 15) return pt.p * kernelFromSq(dSq, toleranceKm, k, s2);
  const children = cellToChildren(pt.cell, res + 1);
  const areas = children.map((c) => cellArea(c, UNITS.km2));
  const total = areas.reduce((s, a) => s + a, 0);
  let A = 0;
  for (let i = 0; i < children.length; i++) {
    const [lat, lon] = cellToLatLng(children[i]!);
    const child: WeightedPoint = {
      xyz: toXyz({ lat, lon }),
      p: (pt.p * areas[i]!) / total,
      s2: HEX_VARIANCE_PER_AREA * areas[i]!,
      cell: children[i]!,
    };
    A += patchSimilarity(child, answer, toleranceKm, widestKm, k);
  }
  return A;
}

/** B = expected self-similarity of the distribution. Does not depend on the answer. */
export function selfSimilarity(
  dist: Distribution,
  toleranceKm: number,
  exact = false,
  k: Kernel = SINGLE_KERNEL,
): number {
  const K = uniformKernelMean(toleranceKm, k);
  const painted = 1 - dist.floor;
  let B = pairSum(dist.points, toleranceKm, exact, k);
  // Cross terms between painted mass and the uniform floor, and floor with itself.
  B += 2 * dist.floor * painted * K;
  B += dist.floor * dist.floor * K;
  return B;
}

export function scoreFromParts(A: number, B: number): number {
  return 500 * (1 + 2 * A - B);
}

export function scoreDistribution(
  dist: Distribution,
  answer: LatLon,
  toleranceKm: number,
  k: Kernel = SINGLE_KERNEL,
  exact = false,
): ScoreBreakdown {
  const A = similarityToAnswer(dist, toXyz(answer), toleranceKm, k);
  const B = selfSimilarity(dist, toleranceKm, exact, k);
  return { score: scoreFromParts(A, B), A, B };
}

/**
 * Build a normalised Distribution from raw painted cells.
 * `intensity` is paint density; `areaKm2` is the cell's real area, so mass is
 * proportional to intensity x area. `floor` is the requested uniform fraction.
 */
export function buildDistribution(
  cells: Iterable<{ lat: number; lon: number; intensity: number; areaKm2: number; h3?: string }>,
  floor: number,
): Distribution {
  const raw: { xyz: Xyz; w: number; s2: number; cell?: string }[] = [];
  let total = 0;
  for (const c of cells) {
    if (c.intensity <= 0) continue;
    const w = c.intensity * c.areaKm2;
    total += w;
    raw.push({ xyz: toXyz(c), w, s2: HEX_VARIANCE_PER_AREA * c.areaKm2, cell: c.h3 });
  }
  if (raw.length === 0) {
    // Nothing painted: everything is floor, regardless of the slider.
    return { points: [], floor: 1 };
  }
  const f = Math.min(1, Math.max(0, floor));
  const painted = 1 - f;
  return {
    points: raw.map((r) => ({ xyz: r.xyz, p: (painted * r.w) / total, s2: r.s2, cell: r.cell })),
    floor: f,
  };
}
