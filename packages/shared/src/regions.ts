/**
 * Region questions: "Paint the whole of Germany". The answer is the country
 * itself, an outline from Natural Earth (see scripts/build-regions.mjs).
 * Practice only for now. The outlines live in regions.json, which the client
 * loads on demand rather than bundling.
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
  UNITS
} from "h3-js"
import { bearing, fromXyz, greatCircleDistance, toXyz, type LatLon } from "./geo.ts"
import { resolutionForTolerance } from "./paint.ts"
import {
  coarsenDistribution,
  regionAnswer,
  scoreRegion,
  type Distribution,
  type Kernel,
  type RegionAnswer
} from "./scoring.ts"

export interface RegionQuestion {
  id: string
  kind: "region"
  prompt: string
  /** Shown after the reveal. */
  label: string
  /** English Wikipedia article title. */
  wiki: string
  /** Area-weighted centre, for framing the map. */
  answer: LatLon
  /** A fifth of the country's equivalent radius, sqrt(area / pi). */
  toleranceKm: number
  /** GeoJSON MultiPolygon coordinates: [lon, lat] rings, outer ring first. */
  outline: number[][][][]
  /** A flag round: the flag shown in place of the name (see flags.ts). */
  flag?: string
}

/** The share of the score that is shape; the rest is nearness. */
export const SHAPE_WEIGHT = 0.4

/**
 * What paint off the country costs in the shape score, per squared share of
 * the paint: as if spread twice as densely as an even coat of the country,
 * however thinly it really is. Spreading wrong paint thinly is still wrong.
 */
export const OFF_COUNTRY_COST = 2

/**
 * Gaussians 5, 10, 20 and 40 tolerances wide: one to eight country radii,
 * since a country's tolerance is a fifth of its radius. Fitted to the
 * targets in calibrate-regions.mjs.
 */
export const NEARNESS_KERNEL: Kernel = {
  id: "nearness",
  label: "Nearness (5r, 10r, 20r, 40r)",
  scales: [5, 10, 20, 40],
  weights: [1 / 6, 1 / 6, 1 / 3, 1 / 3]
}

export interface RegionQuestionScore {
  score: number
  /** Cell-by-cell comparison with the country. */
  shape: number
  /** Kernel score under NEARNESS_KERNEL. */
  nearness: number
}

/**
 * Nearness is scored one H3 resolution coarser than painting, with cells up
 * to half the tolerance across: far finer than its narrowest Gaussian, and
 * much faster.
 */
export function regionScoringRes(toleranceKm: number): number {
  return Math.max(0, resolutionForTolerance(toleranceKm) - 1)
}

/** The region's cells at `res`: those whose centres fall inside the outline. */
export function regionCells(q: RegionQuestion, res: number): string[] {
  const cells = new Set<string>()
  for (const polygon of q.outline) for (const h of polygonToCells(polygon, res, true)) cells.add(h)
  return [...cells]
}

const answers = new Map<string, RegionAnswer>()

/** The kernel-scoring answer for a question, cached per kernel. */
export function regionAnswerFor(q: RegionQuestion, k: Kernel = NEARNESS_KERNEL): RegionAnswer {
  const key = `${q.id}|${k.id}`
  let a = answers.get(key)
  if (!a) {
    a = regionAnswer(regionCells(q, regionScoringRes(q.toleranceKm)), q.toleranceKm, k)
    answers.set(key, a)
  }
  return a
}

export function scoreRegionQuestion(painted: Distribution, q: RegionQuestion): RegionQuestionScore {
  const shape = shapeScore(paintMass(painted, q), q)
  const coarse = coarsenDistribution(painted, regionScoringRes(q.toleranceKm))
  const nearness = scoreRegion(coarse, regionAnswerFor(q)).score
  return { score: SHAPE_WEIGHT * shape + (1 - SHAPE_WEIGHT) * nearness, shape, nearness }
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
export function regionFit(dist: Distribution, q: RegionQuestion): { coverage: number; precision: number } {
  const painted = 1 - dist.floor
  const region = regionAt(q)
  let onMass = 0
  const on: { p: number; area: number }[] = []
  for (const [h, p] of paintMass(dist, q)) {
    const area = region.cells.get(h)
    if (area === undefined) continue
    on.push({ p, area })
    onMass += p
  }
  if (painted <= 0 || onMass <= 0) return { coverage: 0, precision: 0 }
  const half = onMass / region.area / 2
  let covered = 0
  for (const c of on) covered += Math.min(1, c.p / c.area / half) * c.area
  return { coverage: covered / region.area, precision: onMass / painted }
}

export interface RegionMisfit {
  coverage: number
  precision: number
  /**
   * Where the paint off the country mostly is: its bearing from the country's
   * centre and its distance from the nearest part of the country. Null when
   * there is none, or when it surrounds the country rather than leaning one way.
   */
  off: { bearing: number; km: number } | null
  /** Which way from the centre the bare or thin part of the country lies; null when it does not lean one way. */
  bare: { bearing: number } | null
}

/**
 * Below this, weights surround the centre rather than lean one way: the
 * distance from the centre to their mass centre over their mean distance
 * from it.
 */
const LEAN = 0.4

/** Facts for explaining a score in words: regionFit, and which way the misses lie. */
export function regionMisfit(dist: Distribution, q: RegionQuestion): RegionMisfit {
  const { coverage, precision } = regionFit(dist, q)
  const region = regionAt(q)
  const mass = paintMass(dist, q)

  const offCells: [string, number][] = []
  for (const [h, p] of mass) if (!region.cells.has(h)) offCells.push([h, p])
  let off: RegionMisfit["off"] = null
  const offCentre = leaning(q.answer, offCells)
  if (offCentre && !region.cells.has(latLngToCell(offCentre.lat, offCentre.lon, region.res))) {
    let km = Infinity
    for (const h of region.cells.keys()) km = Math.min(km, greatCircleDistance(offCentre, latLng(h)))
    off = { bearing: bearing(q.answer, offCentre), km }
  }

  // Shortfall below half the density the paint on the country would have spread evenly, as regionFit counts it.
  let onMass = 0
  for (const h of region.cells.keys()) onMass += mass.get(h) ?? 0
  const half = onMass / region.area / 2
  const short: [string, number][] = []
  if (half > 0) {
    for (const [h, a] of region.cells) {
      const s = Math.max(0, 1 - (mass.get(h) ?? 0) / a / half) * a
      if (s > 0) short.push([h, s])
    }
  }
  const bareCentre = leaning(q.answer, short)
  return { coverage, precision, off, bare: bareCentre && { bearing: bearing(q.answer, bareCentre) } }
}

function latLng(h: string): LatLon {
  const [lat, lon] = cellToLatLng(h)
  return { lat, lon }
}

/** The weighted cells' mass centre, if they lean away from `centre` rather than surround it. */
function leaning(centre: LatLon, cells: [string, number][]): LatLon | null {
  let total = 0
  let meanKm = 0
  const sum = [0, 0, 0]
  for (const [h, w] of cells) {
    const p = latLng(h)
    const v = toXyz(p)
    for (let i = 0; i < 3; i++) sum[i]! += w * v[i]!
    meanKm += w * greatCircleDistance(centre, p)
    total += w
  }
  if (total <= 0) return null
  const m = fromXyz([sum[0]!, sum[1]!, sum[2]!])
  return greatCircleDistance(centre, m) >= LEAN * (meanKm / total) ? m : null
}

interface Region {
  /** The painting resolution. */
  res: number
  /** The country's cells at the painting resolution, with their areas. */
  cells: Map<string, number>
  area: number
  /** Their ancestors at each coarser resolution, filled in as needed. */
  ancestors: Map<number, Set<string>>
}

const regions = new Map<string, Region>()

/** The country's cells at the painting resolution, with their areas. */
function regionAt(q: RegionQuestion): Region {
  let region = regions.get(q.id)
  if (!region) {
    const res = resolutionForTolerance(q.toleranceKm)
    const cells = new Map<string, number>()
    let area = 0
    for (const h of regionCells(q, res)) {
      const a = cellArea(h, UNITS.km2)
      cells.set(h, a)
      area += a
    }
    region = { res, cells, area, ancestors: new Map() }
    regions.set(q.id, region)
  }
  return region
}

/** Whether a cell coarser than the painting resolution overlaps the country. */
function overlaps(region: Region, h: string, r: number): boolean {
  let set = region.ancestors.get(r)
  if (!set) {
    set = new Set([...region.cells.keys()].map((c) => cellToParent(c, r)))
    region.ancestors.set(r, set)
  }
  return set.has(h)
}

/**
 * The paint's mass per cell at the painting resolution: finer cells merged
 * into their parents, coarser ones (a big brush) over the country shared
 * among their children by area. Coarser cells off the country stay whole:
 * only their total mass counts, and splitting a world painted at world zoom
 * would mean millions of cells. The world floor is left out.
 */
function paintMass(dist: Distribution, q: RegionQuestion): Map<string, number> {
  const res = resolutionForTolerance(q.toleranceKm)
  const region = regionAt(q)
  const mass = new Map<string, number>()
  const add = (h: string, p: number) => mass.set(h, (mass.get(h) ?? 0) + p)
  for (const pt of dist.points) {
    if (!pt.cell) continue
    const r = getResolution(pt.cell)
    if (r >= res) add(r === res ? pt.cell : cellToParent(pt.cell, res), pt.p)
    else if (!overlaps(region, pt.cell, r)) add(pt.cell, pt.p)
    else {
      const children = cellToChildren(pt.cell, res)
      const areas = children.map((c) => cellArea(c, UNITS.km2))
      const total = areas.reduce((a, b) => a + b, 0)
      children.forEach((c, i) => add(c, (pt.p * areas[i]!) / total))
    }
  }
  return mass
}

/**
 * 1000 - 500 (sum (p - q)^2 / a / sum q^2 / a + OFF_COUNTRY_COST m^2) over
 * the country's cells, clamped at 0. With q spread evenly by area, q = a / A
 * in each of them (A its area), so sum q^2 / a = 1 / A.
 */
function shapeScore(mass: Map<string, number>, q: RegionQuestion): number {
  const region = regionAt(q)
  let sum = 0
  for (const [h, a] of region.cells) {
    const diff = (mass.get(h) ?? 0) - a / region.area
    sum += (diff * diff) / a
  }
  let offMass = 0
  for (const [h, p] of mass) if (!region.cells.has(h)) offMass += p
  return Math.max(0, 1000 - 500 * (sum * region.area + OFF_COUNTRY_COST * offMass * offMass))
}
