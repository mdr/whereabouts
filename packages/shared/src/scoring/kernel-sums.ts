import { chordDistanceSq } from "../geo.ts"
import type { Kernel, WeightedPoint } from "./scoring.ts"
import type { Km, SquareKm } from "../units.ts"

const LN2 = Math.LN2

const gaussFromSq = (distSq: SquareKm, width: Km): number => {
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
export const patchWidthSq = (width: Km, s2: SquareKm): number => {
  return width * width + 2 * LN2 * s2
}

const patchGaussFromSq = (distSq: SquareKm, width: Km, s2: SquareKm): number => {
  if (s2 === 0) return gaussFromSq(distSq, width)
  const widthSq = width * width
  const effectiveSq = patchWidthSq(width, s2)
  return (widthSq / effectiveSq) * Math.exp((-LN2 * distSq) / effectiveSq)
}

export const kernelFromSq = (distSq: SquareKm, tolerance: Km, k: Kernel, s2 = 0): number => {
  let sum = 0
  for (let i = 0; i < k.scales.length; i++) {
    sum += k.weights[i]! * patchGaussFromSq(distSq, k.scales[i]! * tolerance, s2)
  }
  return sum
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
export const pairSum = (points: WeightedPoint[], tolerance: Km, exact: boolean, k: Kernel): number => {
  if (exact) return exactCrossSum(points, points, tolerance, k)
  const groups = groupByPatchSize(points)
  let total = 0
  for (let component = 0; component < k.scales.length; component++) {
    const width = k.scales[component]! * tolerance
    for (let a = 0; a < groups.length; a++) {
      for (let b = a; b < groups.length; b++) {
        const { amplitude, sum } = groupGaussSum(groups[a]!, a === b ? undefined : groups[b]!, width, tolerance)
        total += k.weights[component]! * amplitude * (a === b ? sum : 2 * sum)
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
export const crossSum = (
  left: WeightedPoint[],
  right: WeightedPoint[],
  tolerance: Km,
  exact: boolean,
  k: Kernel
): number => {
  if (exact) return exactCrossSum(left, right, tolerance, k)
  const leftGroups = groupByPatchSize(left)
  const rightGroups = groupByPatchSize(right)
  let total = 0
  for (let component = 0; component < k.scales.length; component++) {
    const width = k.scales[component]! * tolerance
    for (const leftGroup of leftGroups) {
      for (const rightGroup of rightGroups) {
        const { amplitude, sum } = groupGaussSum(leftGroup, rightGroup, width, tolerance)
        total += k.weights[component]! * amplitude * sum
      }
    }
  }
  return total
}

const exactCrossSum = (left: WeightedPoint[], right: WeightedPoint[], tolerance: Km, k: Kernel): number => {
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
 * An undefined `other` pairs `group` with itself.
 */
const groupGaussSum = (
  group: PatchGroup,
  other: PatchGroup | undefined,
  width: Km,
  tolerance: Km
): { amplitude: number; sum: number } => {
  const effectiveWidth = Math.sqrt(patchWidthSq(width, group.s2 + (other ?? group).s2))
  // Same rule as before patches: components at least twice the tolerance wide are aggregated.
  const coarse = effectiveWidth >= 2 * tolerance
  const groupPoints = coarse ? aggregate(group.points, effectiveWidth / 8) : group.points
  const otherPoints =
    other === undefined ? groupPoints : coarse ? aggregate(other.points, effectiveWidth / 8) : other.points
  return {
    amplitude: (width * width) / (effectiveWidth * effectiveWidth),
    sum: gaussCrossSum(groupPoints, otherPoints, effectiveWidth)
  }
}

const groupByPatchSize = (points: WeightedPoint[]): PatchGroup[] => {
  const groups = new Map<number, WeightedPoint[]>()
  for (const point of points) {
    // Cells of one H3 resolution differ slightly in area; bucket them together.
    const key = point.s2 ? Math.round(Math.log2(point.s2) * 2) : -Infinity
    const list = groups.get(key)
    if (list) list.push(point)
    else groups.set(key, [point])
  }
  return [...groups.values()].map((members) => {
    let mass = 0
    let s2 = 0
    for (const point of members) {
      mass += point.p
      s2 += point.p * (point.s2 ?? 0)
    }
    return { s2: mass > 0 ? s2 / mass : 0, points: members }
  })
}

/** Merge points into mass-weighted centroids on a 3D grid of cubes `side` across. */
const aggregate = (points: WeightedPoint[], side: Km): WeightedPoint[] => {
  const sums = new Map<string, { x: number; y: number; z: number; p: number }>()
  for (const point of points) {
    const [x, y, z] = point.xyz
    const key = `${Math.floor(x / side)},${Math.floor(y / side)},${Math.floor(z / side)}`
    const sum = sums.get(key)
    if (sum) {
      sum.x += point.p * x
      sum.y += point.p * y
      sum.z += point.p * z
      sum.p += point.p
    } else {
      sums.set(key, { x: point.p * x, y: point.p * y, z: point.p * z, p: point.p })
    }
  }
  const out: WeightedPoint[] = []
  for (const sum of sums.values()) {
    if (sum.p <= 0) continue
    out.push({ xyz: [sum.x / sum.p, sum.y / sum.p, sum.z / sum.p], p: sum.p })
  }
  return out
}

// Coordinates are within +-6371 km, so offsetting by 8192 km keeps indices positive.
const INDEX_OFFSET: Km = 8192

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
  masses: Float64Array
  perCutoff: number
  span: number
  cutoffSq: number
  expScale: number
}

const cellIndex = (grid: CutoffGrid, coordinate: number): number => {
  return Math.floor((coordinate + INDEX_OFFSET) * grid.perCutoff)
}

const bucketKey = (grid: CutoffGrid, bx: number, by: number, bz: number): number => {
  return (bx * grid.span + by) * grid.span + bz
}

const cutoffGrid = (right: WeightedPoint[], width: Km): CutoffGrid => {
  const count = right.length
  const cutoff = CUTOFF_WIDTHS * width
  const perCutoff = 1 / cutoff
  const grid: CutoffGrid = {
    buckets: new Map(),
    xs: new Float64Array(count),
    ys: new Float64Array(count),
    zs: new Float64Array(count),
    masses: new Float64Array(count),
    perCutoff,
    span: Math.ceil(2 * INDEX_OFFSET * perCutoff) + 2,
    cutoffSq: cutoff * cutoff,
    expScale: -LN2 / (width * width)
  }
  for (let i = 0; i < count; i++) {
    const point = right[i]!
    grid.xs[i] = point.xyz[0]
    grid.ys[i] = point.xyz[1]
    grid.zs[i] = point.xyz[2]
    grid.masses[i] = point.p
    const key = bucketKey(
      grid,
      cellIndex(grid, grid.xs[i]!),
      cellIndex(grid, grid.ys[i]!),
      cellIndex(grid, grid.zs[i]!)
    )
    const list = grid.buckets.get(key)
    if (list) list.push(i)
    else grid.buckets.set(key, [i])
  }
  return grid
}

/** Adds `point` against every point in its own and the 26 neighbouring buckets. */
const addNeighbours = (total: number, point: WeightedPoint, grid: CutoffGrid): number => {
  const bx = cellIndex(grid, point.xyz[0])
  const by = cellIndex(grid, point.xyz[1])
  const bz = cellIndex(grid, point.xyz[2])
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const list = grid.buckets.get(bucketKey(grid, bx + dx, by + dy, bz + dz))
        if (list) total = addBucket(total, list, point, grid)
      }
    }
  }
  return total
}

const addBucket = (total: number, list: number[], point: WeightedPoint, grid: CutoffGrid): number => {
  const xi = point.xyz[0],
    yi = point.xyz[1],
    zi = point.xyz[2],
    mass = point.p
  for (const j of list) {
    const ddx = xi - grid.xs[j]!,
      ddy = yi - grid.ys[j]!,
      ddz = zi - grid.zs[j]!
    const distSq = ddx * ddx + ddy * ddy + ddz * ddz
    if (distSq > grid.cutoffSq) continue
    total += mass * grid.masses[j]! * Math.exp(grid.expScale * distSq)
  }
  return total
}

/**
 * Truncated sum over i in `left`, j in `right` of p_i p_j exp(-ln2 d²/w²),
 * using a 3D grid hash of `right` with cells one cutoff wide so each point
 * only visits its 27 neighbouring buckets. When both sides are the same
 * array this is the self pair sum.
 */
const gaussCrossSum = (left: WeightedPoint[], right: WeightedPoint[], width: Km): number => {
  if (right.length === 0 || left.length === 0) return 0
  const grid = cutoffGrid(right, width)
  let total = 0
  for (const point of left) total = addNeighbours(total, point, grid)
  return total
}
