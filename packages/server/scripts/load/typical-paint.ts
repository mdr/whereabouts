/**
 * How a typical player paints a round, built with the real PaintLayer: a few
 * scribbled strokes with the default brush, each uploaded 400 ms after it
 * ends as the client does, sometimes a second patch at another zoom (so
 * another cell size), and on country rounds sometimes a Fill instead.
 */
import { gridDisk, h3Resolution, latLngToCell } from "@whereabouts/shared/h3"
import { compactRecord } from "@whereabouts/shared/paint/compact"
import { FILL_DENSITY } from "@whereabouts/shared/paint/fill"
import { PaintLayer } from "@whereabouts/shared/paint/paint"
import { encodePaint } from "@whereabouts/shared/paint/paint-wire"
import type { LatLon } from "@whereabouts/shared/geo"
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

const between = (random: Random, low: number, high: number) => low + random() * (high - low)
const KM_PER_DEGREE = 111

/** The default 40 px brush at a zoom that shows a few countries; a zoomed patch scales it. */
const BRUSH_RADIUS: Km = 120
/** As the client: a stamp every quarter of the brush radius along the stroke, at 0.3 strength. */
const STAMP_STEP = 0.25
const STAMP_STRENGTH = 0.3
const UPLOAD_DELAY_MS = 400
/** Fills span Bulgaria (410 cells) to Chile (3106). */
const FILL_CELLS = { low: 400, high: 3100 }
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

const fillPlan = (random: Random, centre: LatLon): PaintPlan => {
  const target = between(random, FILL_CELLS.low, FILL_CELLS.high)
  const rings = Math.round((-3 + Math.sqrt(12 * target - 3)) / 6)
  const cells = Object.fromEntries(
    gridDisk(latLngToCell(centre.lat, centre.lon, h3Resolution(5)), rings).map((cell) => [cell, FILL_DENSITY])
  )
  const atMs = between(random, 3000, 10_000)
  return { uploads: [upload(cells, atMs)], lockAtMs: atMs + between(random, 1000, 5000) }
}

const strokesPlan = (random: Random, centre: LatLon): PaintPlan => {
  const layer = new PaintLayer(h3Resolution(8))
  const strokes = Math.floor(between(random, 2, 9))
  const zoomedAt = random() < 0.3 ? Math.floor(between(random, 1, strokes)) : undefined
  const uploads: Upload[] = []
  let at = centre
  let clock = between(random, 2000, 6000)
  for (let stroke = 0; stroke < strokes; stroke++) {
    if (stroke === zoomedAt) at = offset(centre, between(random, -800, 800), between(random, -800, 800))
    const radius = zoomedAt !== undefined && stroke >= zoomedAt ? BRUSH_RADIUS / 3 : BRUSH_RADIUS
    const start = offset(at, between(random, -1, 1) * radius, between(random, -1, 1) * radius)
    scribble(layer, random, start, radius)
    clock += between(random, 500, 1500)
    uploads.push(upload(layer.toRecord(), clock + UPLOAD_DELAY_MS))
    clock += between(random, 1000, 3000)
  }
  return { uploads, lockAtMs: clock + between(random, 500, 3000) }
}

/** A player's uploads for one round, times from the round's start. */
export const typicalPlan = (random: Random, fillAllowed: boolean): PaintPlan => {
  const centre = { lat: between(random, -50, 60), lon: between(random, -170, 170) }
  return fillAllowed && random() < FILL_SHARE ? fillPlan(random, centre) : strokesPlan(random, centre)
}
