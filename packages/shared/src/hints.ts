/**
 * Hints: a band of latitude or longitude the answer lies in. A band narrows
 * one direction only, so a player still has to know where along it to look:
 * painting a whole band scores little more than a pass would.
 */
import { z } from "zod"
import { kmToDegrees, toRadians, type LatLon } from "./geo.ts"
import { cellBoundaryLatLng, cellToLatLng, type H3Cell, type H3Resolution } from "./h3.ts"
import { keepCells } from "./paint/land.ts"
import type { Degrees, Km } from "./units.ts"

export enum HintAxis {
  LATITUDE = "LATITUDE",
  LONGITUDE = "LONGITUDE"
}
export const HintAxisSchema = z.enum(HintAxis)

/**
 * A longitude band that crosses 180° has `from` greater than `to`.
 */
export interface HintBand {
  axis: HintAxis
  from: Degrees
  to: Degrees
}

/** Hints a host may allow per game. */
export const MAX_HINTS = 3
export const DEFAULT_HINTS = 1

/** A band's width, in the round's tolerances. */
export const HINT_WIDTH_TOLERANCES = 10
/** The answer is never in this outer share of the band at either edge. */
const EDGE = 0.15
/** A longitude band near a pole would otherwise span most of the world. */
const MAX_LONGITUDE_SPAN: Degrees = 120

/**
 * The band of `axis` around `answer`, with the answer at a point set by
 * `unit` (0 to 1) away from the edges. Edges are rounded outwards to whole
 * degrees, or tenths for a narrow band, so the labels are the band.
 */
export const hintBand = (answer: LatLon, tolerance: Km, axis: HintAxis, unit: number): HintBand => {
  const span = kmToDegrees(HINT_WIDTH_TOLERANCES * tolerance)
  const at = EDGE + unit * (1 - 2 * EDGE)
  if (axis === HintAxis.LATITUDE) {
    const width = Math.min(span, 180)
    let from = answer.lat - at * width
    from = Math.min(Math.max(from, -90), 90 - width)
    const step = width < 5 ? 0.1 : 1
    return { axis, from: Math.max(-90, floorTo(from, step)), to: Math.min(90, ceilTo(from + width, step)) }
  }
  const width = Math.min(span / Math.cos(toRadians(answer.lat)), MAX_LONGITUDE_SPAN)
  const from = answer.lon - at * width
  const step = width < 5 ? 0.1 : 1
  return { axis, from: wrap(floorTo(from, step)), to: wrap(ceilTo(from + width, step)) }
}

/** Whether a point lies in the band. */
export const inHintBand = (band: HintBand, point: LatLon): boolean => {
  if (band.axis === HintAxis.LATITUDE) return point.lat >= band.from && point.lat <= band.to
  return band.from <= band.to
    ? point.lon >= band.from && point.lon <= band.to
    : point.lon >= band.from || point.lon <= band.to
}

/** The paint without its cells wholly outside the band, split at the band's edges down to `finestResolution`. */
export const trimToHint = (
  cells: ReadonlyMap<H3Cell, number>,
  band: HintBand,
  finestResolution: H3Resolution
): Map<H3Cell, number> => keepCells(cells, (cell) => cellMeetsBand(cell, band), finestResolution)

const cellMeetsBand = (cell: H3Cell, band: HintBand): boolean => {
  const corners = cellBoundaryLatLng(cell)
  if (band.axis === HintAxis.LATITUDE) {
    const lats = corners.map(([lat]) => lat)
    return Math.max(...lats) >= band.from && Math.min(...lats) <= band.to
  }
  // Corner longitudes taken around the centre, so a cell across 180° stays one span.
  const [, centre] = cellToLatLng(cell)
  const lons = corners.map(([, lon]) => centre + wrap(lon - centre))
  const lowest = Math.min(...lons)
  const highest = Math.max(...lons)
  const to = band.to < band.from ? band.to + 360 : band.to
  return [-360, 0, 360].some((shift) => highest + shift >= band.from && lowest + shift <= to)
}

/** "Between 23°N and 37°N", "Between 170°E and 165°W". */
export const describeHint = (band: HintBand): string => {
  const [positive, negative] = band.axis === HintAxis.LATITUDE ? ["N", "S"] : ["E", "W"]
  const describe = (degrees: Degrees) => {
    const magnitude = Math.abs(Math.round(degrees * 10) / 10)
    return magnitude === 0 || magnitude === 180 ? `${magnitude}°` : `${magnitude}°${degrees > 0 ? positive : negative}`
  }
  return `Between ${describe(band.from)} and ${describe(band.to)}`
}

/** A number from 0 to 1 that depends only on its inputs (mulberry32). */
export const seededUnit = (...parts: number[]): number => {
  let state = parts.reduce((hash, part) => Math.imul(hash ^ part, 0x9e3779b1) >>> 0, 0x6d2b79f5)
  state = Math.imul(state ^ (state >>> 15), state | 1)
  state ^= state + Math.imul(state ^ (state >>> 7), state | 61)
  return ((state ^ (state >>> 14)) >>> 0) / 4294967296
}

const floorTo = (value: Degrees, step: Degrees): Degrees => Math.round(Math.floor(value / step) * step * 10) / 10
const ceilTo = (value: Degrees, step: Degrees): Degrees => Math.round(Math.ceil(value / step) * step * 10) / 10
const wrap = (lon: Degrees): Degrees => ((((lon + 180) % 360) + 360) % 360) - 180
