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
}

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

function kernelFromSq(distSqKm: number, toleranceKm: number, k: Kernel): number {
  let v = 0;
  for (let i = 0; i < k.scales.length; i++) {
    v += k.weights[i]! * gaussFromSq(distSqKm, k.scales[i]! * toleranceKm);
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
 * self-pairs. Each Gaussian component is summed separately. For components
 * wider than the tolerance the points are first aggregated onto a 3D grid an
 * eighth of that width, which keeps the cost bounded when the cutoff spans
 * the globe while displacing mass by far less than the component width.
 */
export function pairSum(
  points: WeightedPoint[],
  toleranceKm: number,
  exact = false,
  k: Kernel = SINGLE_KERNEL,
): number {
  let total = 0;
  for (let i = 0; i < k.scales.length; i++) {
    const width = k.scales[i]! * toleranceKm;
    const pts = k.scales[i]! > 1 && !exact ? aggregate(points, width / 8) : points;
    total += k.weights[i]! * gaussPairSum(pts, width, exact);
  }
  return total;
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

function gaussPairSum(points: WeightedPoint[], widthKm: number, exact: boolean): number {
  const n = points.length;
  if (n === 0) return 0;
  const invW2 = -LN2 / (widthKm * widthKm);
  if (exact) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const pi = points[i]!;
      for (let j = 0; j < n; j++) {
        const pj = points[j]!;
        total += pi.p * pj.p * Math.exp(invW2 * chordDistanceSq(pi.xyz, pj.xyz));
      }
    }
    return total;
  }

  // Flat typed arrays and integer bucket keys: this loop is the hot path for
  // the live score, so avoid per-pair allocation and string hashing.
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const zs = new Float64Array(n);
  const ps = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const pt = points[i]!;
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
  const SPAN = Math.ceil((2 * OFF) * inv) + 2;
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
  for (let i = 0; i < n; i++) {
    const xi = xs[i]!, yi = ys[i]!, zi = zs[i]!, pi = ps[i]!;
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
            const ddx = xi - xs[j]!, ddy = yi - ys[j]!, ddz = zi - zs[j]!;
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

/** A(y) = expected similarity to the answer y. */
export function similarityToAnswer(
  dist: Distribution,
  answer: Xyz,
  toleranceKm: number,
  k: Kernel = SINGLE_KERNEL,
): number {
  let A = 0;
  for (const pt of dist.points) {
    A += pt.p * kernelFromSq(chordDistanceSq(pt.xyz, answer), toleranceKm, k);
  }
  A += dist.floor * uniformKernelMean(toleranceKm, k);
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
  cells: Iterable<{ lat: number; lon: number; intensity: number; areaKm2: number }>,
  floor: number,
): Distribution {
  const raw: { xyz: Xyz; w: number }[] = [];
  let total = 0;
  for (const c of cells) {
    if (c.intensity <= 0) continue;
    const w = c.intensity * c.areaKm2;
    total += w;
    raw.push({ xyz: toXyz(c), w });
  }
  if (raw.length === 0) {
    // Nothing painted: everything is floor, regardless of the slider.
    return { points: [], floor: 1 };
  }
  const f = Math.min(1, Math.max(0, floor));
  const painted = 1 - f;
  return {
    points: raw.map((r) => ({ xyz: r.xyz, p: (painted * r.w) / total })),
    floor: f,
  };
}
