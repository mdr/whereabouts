/**
 * Hints: a band of latitude or longitude the answer lies in. A band narrows
 * one direction only, so a player still has to know where along it to look:
 * painting a whole band scores little more than a pass would.
 */
import { z } from "zod"
import type { LatLon } from "./geo.ts"
import { cellToBoundary, cellToLatLng, type H3Cell, type H3Res } from "./h3.ts"
import { keepCells } from "./land.ts"

export const HintAxisSchema = z.enum(["latitude", "longitude"])
export type HintAxis = z.infer<typeof HintAxisSchema>

/**
 * The band, in degrees. A longitude band that crosses 180° has `from`
 * greater than `to`.
 */
export interface HintBand {
  axis: HintAxis
  from: number
  to: number
}

/** Hints a host may allow per game. */
export const MAX_HINTS = 3
export const DEFAULT_HINTS = 1

/** A band's width, in the round's tolerances. */
export const HINT_WIDTH_TOLERANCES = 10
/** The answer is never in this outer share of the band at either edge. */
const EDGE = 0.15
/** A longitude band near a pole would otherwise span most of the world. */
const MAX_LONGITUDE_SPAN = 120
const KM_PER_DEGREE = 111.195

/**
 * The band of `axis` around `answer`, with the answer at a point set by
 * `u` (0 to 1) away from the edges. Edges are rounded outwards to whole
 * degrees, or tenths for a narrow band, so the labels are the band.
 */
export function hintBand(answer: LatLon, toleranceKm: number, axis: HintAxis, u: number): HintBand {
  const km = HINT_WIDTH_TOLERANCES * toleranceKm
  const at = EDGE + u * (1 - 2 * EDGE)
  if (axis === "latitude") {
    const width = Math.min(km / KM_PER_DEGREE, 180)
    let from = answer.lat - at * width
    from = Math.min(Math.max(from, -90), 90 - width)
    const step = width < 5 ? 0.1 : 1
    return { axis, from: Math.max(-90, floorTo(from, step)), to: Math.min(90, ceilTo(from + width, step)) }
  }
  const width = Math.min(km / (KM_PER_DEGREE * Math.cos((answer.lat * Math.PI) / 180)), MAX_LONGITUDE_SPAN)
  const from = answer.lon - at * width
  const step = width < 5 ? 0.1 : 1
  return { axis, from: wrap(floorTo(from, step)), to: wrap(ceilTo(from + width, step)) }
}

/** Whether a point lies in the band. */
export function inHintBand(band: HintBand, p: LatLon): boolean {
  if (band.axis === "latitude") return p.lat >= band.from && p.lat <= band.to
  return band.from <= band.to ? p.lon >= band.from && p.lon <= band.to : p.lon >= band.from || p.lon <= band.to
}

/** The paint without its cells wholly outside the band, split at the band's edges down to `finestRes`. */
export function trimToHint(cells: ReadonlyMap<H3Cell, number>, band: HintBand, finestRes: H3Res): Map<H3Cell, number> {
  return keepCells(cells, (h) => cellMeetsBand(h, band), finestRes)
}

function cellMeetsBand(h: H3Cell, band: HintBand): boolean {
  const corners = cellToBoundary(h)
  if (band.axis === "latitude") {
    const lats = corners.map(([lat]) => lat)
    return Math.max(...lats) >= band.from && Math.min(...lats) <= band.to
  }
  // Corner longitudes taken around the centre, so a cell across 180° stays one span.
  const [, centre] = cellToLatLng(h)
  const lons = corners.map(([, lon]) => centre + wrap(lon - centre))
  const lo = Math.min(...lons)
  const hi = Math.max(...lons)
  const to = band.to < band.from ? band.to + 360 : band.to
  return [-360, 0, 360].some((shift) => hi + shift >= band.from && lo + shift <= to)
}

/** "Between 23°N and 37°N", "Between 170°E and 165°W". */
export function describeHint(band: HintBand): string {
  const [pos, neg] = band.axis === "latitude" ? ["N", "S"] : ["E", "W"]
  const deg = (v: number) => {
    const n = Math.abs(Math.round(v * 10) / 10)
    return n === 0 || n === 180 ? `${n}°` : `${n}°${v > 0 ? pos : neg}`
  }
  return `Between ${deg(band.from)} and ${deg(band.to)}`
}

/** A number from 0 to 1 that depends only on its inputs (mulberry32). */
export function seededUnit(...parts: number[]): number {
  let t = parts.reduce((h, p) => Math.imul(h ^ p, 0x9e3779b1) >>> 0, 0x6d2b79f5)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const floorTo = (v: number, step: number) => Math.round(Math.floor(v / step) * step * 10) / 10
const ceilTo = (v: number, step: number) => Math.round(Math.ceil(v / step) * step * 10) / 10
const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180
