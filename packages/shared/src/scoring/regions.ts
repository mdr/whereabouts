/**
 * Scoring area answers: "Paint the whole of Germany". The answer is the
 * country itself, an outline from Natural Earth (see
 * scripts/build-regions.mjs). The outlines live in outlines.json, which the
 * client loads on demand rather than bundling.
 *
 * The score is SHAPE_WEIGHT x shape + (1 - SHAPE_WEIGHT) x nearness, a sum
 * like the point rule's mixture of kernels, so credit for covering the
 * country and for being near it add up (docs/country-scoring.md):
 *
 * - shape compares the paint with the country cell by cell, at the painting
 *   resolution: 1000 - 500 (sum (p - q)^2 / a / sum q^2 / a + OFF_COUNTRY_COST
 *   x m^2), with p and q the paint's and the country's mass in each of the
 *   country's cells of area a, and m the paint's mass off the country. Off
 *   the country only the amount counts, not how it is spread: where it is
 *   is nearness's business.
 * - nearness is the kernel score (scoreRegion) under NEARNESS_KERNEL,
 *   Gaussians one to eight country radii wide, so it sees partial coverage,
 *   spill and misses by how near they are.
 *
 * Paint density is not capped: how heavily each candidate is painted is how
 * a player hedges.
 */
import {
  cellArea,
  cellToChildren,
  cellToLatLng,
  cellToParent,
  getResolution,
  latLngToCell,
  polygonToCells,
  h3Resolution,
  type H3Cell,
  type H3Resolution
} from "../h3.ts"
import { bearing, fromXyz, greatCircleDistance, toXyz, type Box, type LatLon } from "../geo.ts"
import type { Degrees, Km, Points, SquareKm } from "../units.ts"
import {
  AnswerType,
  MIN_SPREAD,
  answerCentre,
  type Answer,
  type AreaAnswer,
  type Outline,
  type Outlines,
  type PointAnswer
} from "../questions.ts"
import type { OutlineId } from "../ids.ts"
import { resolutionForTolerance } from "../paint/paint.ts"
import {
  PASS_SCORE,
  coarsenDistribution,
  regionAnswer,
  scoreDistribution,
  scoreRegion,
  type Distribution,
  type Kernel,
  type RegionAnswer
} from "./scoring.ts"

/** An area answer with its outline, as scoring needs it. */
export type Area = AreaAnswer & { polygons: Outline }

/** What a guess is scored against: a point, or an area with its outline. */
export type ScoredAnswer = PointAnswer | Area

/** An answer ready to score, its outline looked up. */
export const scoredAnswer = (answer: Answer, outlines: Outlines): ScoredAnswer => {
  if (answer.type === AnswerType.POINT) return answer
  const polygons = outlines.get(answer.outline)
  if (!polygons) throw new Error(`no outline ${answer.outline}`)
  return { ...answer, polygons }
}

/** The share of the score that is shape; the rest is nearness. */
export const SHAPE_WEIGHT = 0.4

/**
 * What paint off the country costs in the shape score, per squared share of
 * the paint: as if spread twice as densely as an even coat of the country,
 * however thinly it really is. Spreading wrong paint thinly is still wrong.
 */
const OFF_COUNTRY_COST = 2

/**
 * Gaussians 5, 10, 20 and 40 tolerances wide: one to eight country radii,
 * since a country's tolerance is a fifth of its radius. Fitted to the
 * targets in calibrate-regions.mjs.
 */
const NEARNESS_KERNEL: Kernel = {
  id: "nearness",
  label: "Nearness (5r, 10r, 20r, 40r)",
  scales: [5, 10, 20, 40],
  weights: [1 / 6, 1 / 6, 1 / 3, 1 / 3]
}

export interface AreaScore {
  score: Points
  /** Cell-by-cell comparison with the country. */
  shape: Points
  /** Kernel score under NEARNESS_KERNEL. */
  nearness: Points
}

/**
 * Nearness is scored one H3 resolution coarser than painting, with cells up
 * to half the tolerance across: far finer than its narrowest Gaussian, and
 * much faster.
 */
export const regionScoringResolution = (tolerance: Km): H3Resolution =>
  h3Resolution(Math.max(0, resolutionForTolerance(tolerance) - 1))

/** The region's cells at `resolution`: those whose centres fall inside the outline. */
export const regionCells = (area: Area, resolution: H3Resolution): H3Cell[] => {
  const cells = new Set<H3Cell>()
  for (const polygon of area.polygons) for (const cell of polygonToCells(polygon, resolution, true)) cells.add(cell)
  return [...cells]
}

const boxes = new Map<OutlineId, Box>()

/** Whether a point is inside a region's outline: inside an odd number of each polygon's rings. */
export const insideRegion = (area: Area, { lat, lon }: LatLon): boolean => {
  let box = boxes.get(area.outline)
  if (!box) {
    const points = area.polygons.flatMap((polygon) => polygon[0]!)
    const lons = points.map(([x]) => x)
    const lats = points.map(([, y]) => y)
    box = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
    boxes.set(area.outline, box)
  }
  if (lon < box[0] || lat < box[1] || lon > box[2] || lat > box[3]) return false
  return area.polygons.some((polygon) => {
    let odd = false
    for (const ring of polygon)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[i]!
        const [x2, y2] = ring[j]!
        if (y1 > lat !== y2 > lat && lon < x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1)) odd = !odd
      }
    return odd
  })
}

/**
 * Whether two rounds ask about the same part of the world: one's answer
 * inside the other's outline (Gaborone and Botswana, Honshu and Japan), or
 * two places close together.
 */
export const roundsOverlap = (a: ScoredAnswer, b: ScoredAnswer): boolean => {
  if (a.type === AnswerType.POINT && b.type === AnswerType.POINT) return greatCircleDistance(a.at, b.at) <= MIN_SPREAD
  return (
    (a.type === AnswerType.AREA && insideRegion(a, answerCentre(b))) ||
    (b.type === AnswerType.AREA && insideRegion(b, answerCentre(a)))
  )
}

const answers = new Map<string, RegionAnswer>()

/** The kernel-scoring answer for a question, cached per kernel. */
const regionAnswerFor = (area: Area, k: Kernel = NEARNESS_KERNEL): RegionAnswer => {
  const key = `${area.outline}|${k.id}`
  let cached = answers.get(key)
  if (!cached) {
    cached = regionAnswer(regionCells(area, regionScoringResolution(area.tolerance)), area.tolerance, k)
    answers.set(key, cached)
  }
  return cached
}

export const scoreArea = (painted: Distribution, area: Area): AreaScore => {
  const shape = shapeScore(paintMass(painted, area), area)
  const coarse = coarsenDistribution(painted, regionScoringResolution(area.tolerance))
  const nearness = scoreRegion(coarse, regionAnswerFor(area)).score
  return { score: SHAPE_WEIGHT * shape + (1 - SHAPE_WEIGHT) * nearness, shape, nearness }
}

/** The point rule's parts. */
interface PointParts {
  type: AnswerType.POINT
  A: number
  B: number
}

/** The area rule's parts. */
interface AreaParts {
  type: AnswerType.AREA
  shape: Points
  nearness: Points
}

/**
 * What went into an answer's score, by the rule that scored it. A pass is
 * scored by the point rule, as an even spread, whatever the answer.
 */
export type AnswerParts = PointParts | AreaParts

/**
 * A guess's score, by its question's rule; `painted` undefined is a pass.
 * Games, practice and score review all score through here.
 */
export const scoreAnswer = (
  painted: Distribution | undefined,
  answer: ScoredAnswer,
  kernel: Kernel
): { score: Points; parts: AnswerParts } => {
  if (!painted) return { score: PASS_SCORE.score, parts: { type: AnswerType.POINT, A: PASS_SCORE.A, B: PASS_SCORE.B } }
  if (answer.type === AnswerType.AREA) {
    const { score, shape, nearness } = scoreArea(painted, answer)
    return { score, parts: { type: AnswerType.AREA, shape, nearness } }
  }
  const { score, A, B } = scoreDistribution(painted, answer.at, answer.tolerance, kernel)
  return { score, parts: { type: AnswerType.POINT, A, B } }
}

/**
 * How the paint sits against the country, shown on the reveal to explain the
 * score (it does not feed into it). Precision: the share of the paint
 * (leaving out the world floor) that is on the country. Coverage: the share
 * of the country that got at least half its fair share of that paint, the
 * density it would have spread evenly over the whole country, with partial
 * credit below; so an exact paint covers all of it, and so does a 50/50
 * hedge with another place.
 */
export const regionFit = (painted: Distribution, area: Area): { coverage: number; precision: number } => {
  const paintedMass = 1 - painted.floor
  const region = regionAt(area)
  let onMass = 0
  const on: { mass: number; area: SquareKm }[] = []
  for (const [cell, mass] of paintMass(painted, area)) {
    const size = region.cells.get(cell)
    if (size === undefined) continue
    on.push({ mass, area: size })
    onMass += mass
  }
  if (paintedMass <= 0 || onMass <= 0) return { coverage: 0, precision: 0 }
  const half = onMass / region.area / 2
  let covered = 0
  for (const entry of on) covered += Math.min(1, entry.mass / entry.area / half) * entry.area
  return { coverage: covered / region.area, precision: onMass / paintedMass }
}

/** Where paint off a country lies, from it. */
interface PaintOffCountry {
  bearing: Degrees
  distance: Km
}

export interface RegionMisfit {
  coverage: number
  precision: number
  /**
   * Where the paint off the country mostly is: its bearing from the country's
   * centre and its distance from the nearest part of the country. Undefined when
   * there is none, or when it surrounds the country rather than leaning one way.
   */
  off: PaintOffCountry | undefined
}

/**
 * Below this, weights surround the centre rather than lean one way: the
 * distance from the centre to their mass centre over their mean distance
 * from it.
 */
const LEAN = 0.4

/** regionFit, and where the paint off the country lies, for the awards. */
export const regionMisfit = (painted: Distribution, area: Area): RegionMisfit => {
  const { coverage, precision } = regionFit(painted, area)
  const region = regionAt(area)
  const mass = paintMass(painted, area)

  const offCells: [H3Cell, number][] = []
  for (const [cell, weight] of mass) if (!region.cells.has(cell)) offCells.push([cell, weight])
  let off: PaintOffCountry | undefined = undefined
  const offCentre = leaning(area.centre, offCells)
  if (offCentre && !region.cells.has(latLngToCell(offCentre.lat, offCentre.lon, region.resolution))) {
    let distance = Infinity
    for (const cell of region.cells.keys()) distance = Math.min(distance, greatCircleDistance(offCentre, latLng(cell)))
    off = { bearing: bearing(area.centre, offCentre), distance }
  }

  return { coverage, precision, off }
}

const latLng = (cell: H3Cell): LatLon => {
  const [lat, lon] = cellToLatLng(cell)
  return { lat, lon }
}

/** The weighted cells' mass centre, if they lean away from `centre` rather than surround it. */
const leaning = (centre: LatLon, cells: [H3Cell, number][]): LatLon | undefined => {
  let total = 0
  let meanDistance: Km = 0
  const sum = [0, 0, 0]
  for (const [cell, weight] of cells) {
    const spot = latLng(cell)
    const xyz = toXyz(spot)
    for (let i = 0; i < 3; i++) sum[i]! += weight * xyz[i]!
    meanDistance += weight * greatCircleDistance(centre, spot)
    total += weight
  }
  if (total <= 0) return undefined
  const massCentre = fromXyz([sum[0]!, sum[1]!, sum[2]!])
  return greatCircleDistance(centre, massCentre) >= LEAN * (meanDistance / total) ? massCentre : undefined
}

interface Region {
  /** The painting resolution. */
  resolution: H3Resolution
  /** The country's cells at the painting resolution, with their areas. */
  cells: Map<H3Cell, SquareKm>
  area: SquareKm
  /** Their ancestors at each coarser resolution, filled in as needed. */
  ancestors: Map<H3Resolution, Set<H3Cell>>
}

const regions = new Map<OutlineId, Region>()

/** The country's cells at the painting resolution, with their areas. */
const regionAt = (area: Area): Region => {
  let region = regions.get(area.outline)
  if (!region) {
    const resolution = resolutionForTolerance(area.tolerance)
    const cells = new Map<H3Cell, SquareKm>()
    let totalArea = 0
    for (const cell of regionCells(area, resolution)) {
      const size = cellArea(cell)
      cells.set(cell, size)
      totalArea += size
    }
    region = { resolution, cells, area: totalArea, ancestors: new Map() }
    regions.set(area.outline, region)
  }
  return region
}

/** Whether a cell coarser than the painting resolution overlaps the country. */
const overlaps = (region: Region, cell: H3Cell, resolution: H3Resolution): boolean => {
  let set = region.ancestors.get(resolution)
  if (!set) {
    set = new Set([...region.cells.keys()].map((regionCell) => cellToParent(regionCell, resolution)))
    region.ancestors.set(resolution, set)
  }
  return set.has(cell)
}

/**
 * The paint's mass per cell at the painting resolution: finer cells merged
 * into their parents, coarser ones (a big brush) over the country shared
 * among their children by area. Coarser cells off the country stay whole:
 * only their total mass counts, and splitting a world painted at world zoom
 * would mean millions of cells. The world floor is left out.
 */
const paintMass = (painted: Distribution, area: Area): Map<H3Cell, number> => {
  const paintResolution = resolutionForTolerance(area.tolerance)
  const region = regionAt(area)
  const mass = new Map<H3Cell, number>()
  const add = (cell: H3Cell, amount: number) => mass.set(cell, (mass.get(cell) ?? 0) + amount)
  for (const point of painted.points) {
    if (!point.cell) continue
    const resolution = getResolution(point.cell)
    if (resolution >= paintResolution)
      add(resolution === paintResolution ? point.cell : cellToParent(point.cell, paintResolution), point.p)
    else if (!overlaps(region, point.cell, resolution)) add(point.cell, point.p)
    else {
      const children = cellToChildren(point.cell, paintResolution)
      const areas = children.map((child) => cellArea(child))
      const total = areas.reduce((a, b) => a + b, 0)
      children.forEach((child, i) => add(child, (point.p * areas[i]!) / total))
    }
  }
  return mass
}

/**
 * 1000 - 500 (sum (p - q)^2 / a / sum q^2 / a + OFF_COUNTRY_COST m^2) over
 * the country's cells, clamped at 0. With q spread evenly by area, q = a / A
 * in each of them (A its area), so sum q^2 / a = 1 / A.
 */
const shapeScore = (mass: Map<H3Cell, number>, area: Area): Points => {
  const region = regionAt(area)
  let sum = 0
  for (const [cell, area] of region.cells) {
    const diff = (mass.get(cell) ?? 0) - area / region.area
    sum += (diff * diff) / area
  }
  let offMass = 0
  for (const [cell, amount] of mass) if (!region.cells.has(cell)) offMass += amount
  return Math.max(0, 1000 - 500 * (sum * region.area + OFF_COUNTRY_COST * offMass * offMass))
}
