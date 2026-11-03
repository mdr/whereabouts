/**
 * How a typical player paints a round, built with the real PaintLayer at the
 * question's resolution: a few scribbled strokes with a brush about the
 * tolerance across, near the answer, each uploaded 400 ms after it ends as
 * the client does; sometimes a second patch zoomed in (so smaller cells); and
 * on a round with an outline sometimes a Fill of the country instead.
 */
import { compactRecord } from "@whereabouts/shared/paint/compact"
import { countryFill, FILL_DENSITY, FillShapeType } from "@whereabouts/shared/paint/fill"
import { PaintLayer, resolutionForTolerance } from "@whereabouts/shared/paint/paint"
import { encodePaint } from "@whereabouts/shared/paint/paint-wire"
import type { LatLon } from "@whereabouts/shared/geo"
import type { Outline } from "@whereabouts/shared/questions"
import type { Km } from "@whereabouts/shared/units"

interface Upload {
  atMs: number
  bytes: Uint8Array
  cells: number
}

export interface PaintPlan {
  uploads: Upload[]
  lockAtMs: number
}

/** What a player knows of the question, and roughly where they think the answer is. */
export interface Asked {
  tolerance: Km
  /** The answer, when the load test could look it up; guesses land a few tolerances from it. */
  answer: LatLon | undefined
  /** The country's outline, on a round with one: then a player may Fill it. */
  outline: Outline | undefined
}

type Random = () => number

/** A small seeded generator (mulberry32), so a run can be repeated. */
export const seededRandom = (seed: number): Random => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const between = (random: Random, low: number, high: number): number => low + random() * (high - low)
const KM_PER_DEGREE = 111

/** The default 40 px brush, in tolerances, at the zooms players paint at; a zoomed patch is a third of it. */
const BRUSH_TOLERANCES = { low: 0.6, high: 1.5 }
/** How far from the answer, in tolerances, a guess is centred. */
const GUESS_ERROR = 3
/** As the client: a stamp every quarter of the brush radius along the stroke, at 0.3 strength. */
const STAMP_STEP = 0.25
const STAMP_STRENGTH = 0.3
const UPLOAD_DELAY_MS = 400
const FILL_SHARE = 0.4

const offset = (at: LatLon, eastKm: number, northKm: number): LatLon => ({
  lat: Math.max(-80, Math.min(80, at.lat + northKm / KM_PER_DEGREE)),
  lon: at.lon + eastKm / (KM_PER_DEGREE * Math.cos((at.lat * Math.PI) / 180))
})

/** One stroke: a wandering line a few brush widths long. */
const scribble = (layer: PaintLayer, random: Random, start: LatLon, radius: Km): void => {
  const length = between(random, 3, 8) * radius
  let heading = random() * 2 * Math.PI
  let at = start
  for (let travelled = 0; travelled < length; travelled += STAMP_STEP * radius) {
    layer.stamp(at, radius, STAMP_STRENGTH)
    heading += between(random, -0.5, 0.5)
    at = offset(at, Math.cos(heading) * STAMP_STEP * radius, Math.sin(heading) * STAMP_STEP * radius)
  }
}

const upload = (cells: Record<string, number>, atMs: number): Upload => {
  const compacted = compactRecord(cells)
  return {
    atMs,
    bytes: encodePaint({ cells: compacted, floor: 0.05 }),
    cells: Object.keys(compacted).length
  }
}

const fillPlan = (random: Random, layer: PaintLayer, outline: Outline, answer: LatLon): PaintPlan => {
  const filled = countryFill({ type: FillShapeType.OUTLINE, outline, answer }, layer.resolution)
  const cells = Object.fromEntries(filled.map((cell) => [cell, FILL_DENSITY]))
  const atMs = between(random, 3000, 10_000)
  return { uploads: [upload(cells, atMs)], lockAtMs: atMs + between(random, 1000, 5000) }
}

const strokesPlan = (random: Random, layer: PaintLayer, centre: LatLon, tolerance: Km): PaintPlan => {
  const brush = tolerance * between(random, BRUSH_TOLERANCES.low, BRUSH_TOLERANCES.high)
  const strokes = Math.floor(between(random, 2, 9))
  const zoomedAt = random() < 0.3 ? Math.floor(between(random, 1, strokes)) : undefined
  const uploads: Upload[] = []
  let at = centre
  let clock = between(random, 2000, 6000)
  for (let stroke = 0; stroke < strokes; stroke++) {
    if (stroke === zoomedAt) at = offset(centre, between(random, -3, 3) * brush, between(random, -3, 3) * brush)
    const radius = zoomedAt !== undefined && stroke >= zoomedAt ? brush / 3 : brush
    const start = offset(at, between(random, -1, 1) * radius, between(random, -1, 1) * radius)
    scribble(layer, random, start, radius)
    clock += between(random, 500, 1500)
    uploads.push(upload(layer.toRecord(), clock + UPLOAD_DELAY_MS))
    clock += between(random, 1000, 3000)
  }
  return { uploads, lockAtMs: clock + between(random, 500, 3000) }
}

/** A player's uploads for one round, times from the round's start. */
export const typicalPlan = (random: Random, { tolerance, answer, outline }: Asked): PaintPlan => {
  const layer = new PaintLayer(resolutionForTolerance(tolerance))
  const target = answer ?? { lat: between(random, -50, 60), lon: between(random, -170, 170) }
  if (outline && random() < FILL_SHARE) return fillPlan(random, layer, outline, target)
  const error = GUESS_ERROR * tolerance
  const centre = offset(target, between(random, -error, error), between(random, -error, error))
  return strokesPlan(random, layer, centre, tolerance)
}
