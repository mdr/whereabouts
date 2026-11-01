/**
 * H3 cells and resolutions as branded values, and the h3-js functions the
 * game uses, typed with them. Code imports H3 from here, never from h3-js
 * directly (a lint rule enforces it), so a cell cannot be mistaken for
 * another string, nor a resolution for another number.
 *
 * A cell or resolution from outside (a paint upload, a test) goes through
 * the checked constructors. What h3-js returns is branded unchecked: it only
 * ever returns valid cells, and scoring makes millions of them.
 */
import * as h3 from "h3-js"
import { z } from "zod"
import type { Ring } from "./geo.ts"
import type { Degrees, Km, SquareKm } from "./units.ts"

export const H3CellSchema = z
  .string()
  .regex(/^[0-9a-f]{15}$/)
  .refine((text) => h3.isValidCell(text), "not an H3 cell")
  .brand<"H3Cell">()
export type H3Cell = z.infer<typeof H3CellSchema>
export const h3Cell = (text: string): H3Cell => H3CellSchema.parse(text)

export const H3ResolutionSchema = z.number().int().min(0).max(15).brand<"H3Resolution">()
export type H3Resolution = z.infer<typeof H3ResolutionSchema>
export const h3Resolution = (value: number): H3Resolution => H3ResolutionSchema.parse(value)

const RESOLUTIONS = Array.from({ length: 16 }, (_, resolution) => h3Resolution(resolution))

/** Resolutions 0 to `max`, coarsest first. */
export const resolutionsTo = (max: number): readonly H3Resolution[] => RESOLUTIONS.slice(0, max + 1)

/** One level finer, from a table: scoring steps down millions of times. */
export function finerResolution(resolution: H3Resolution): H3Resolution {
  const finer = RESOLUTIONS[resolution + 1]
  if (finer === undefined) throw new RangeError(`no resolution finer than ${resolution}`)
  return finer
}

/** One level coarser. */
export function coarserResolution(resolution: H3Resolution): H3Resolution {
  const coarser = RESOLUTIONS[resolution - 1]
  if (coarser === undefined) throw new RangeError(`no resolution coarser than ${resolution}`)
  return coarser
}

const brandCell = (value: string) => value as H3Cell
const brandCells = (values: string[]) => values as H3Cell[]

/** A record's cells and values: Object.entries would widen its keys to plain strings. */
export const cellEntries = <V>(record: Readonly<Record<H3Cell, V>>): [H3Cell, V][] =>
  Object.entries(record) as [H3Cell, V][]

export const latLngToCell = (lat: Degrees, lng: Degrees, resolution: H3Resolution): H3Cell =>
  brandCell(h3.latLngToCell(lat, lng, resolution))
export const cellToParent = (cell: H3Cell, resolution: H3Resolution): H3Cell =>
  brandCell(h3.cellToParent(cell, resolution))
export const cellToChildren = (cell: H3Cell, resolution: H3Resolution): H3Cell[] =>
  brandCells(h3.cellToChildren(cell, resolution))
export const getResolution = (cell: H3Cell): H3Resolution => h3.getResolution(cell) as H3Resolution
export const cellToLatLng = (cell: H3Cell): [lat: Degrees, lng: Degrees] => h3.cellToLatLng(cell)
export const cellBoundaryLatLng = (cell: H3Cell): [lat: Degrees, lng: Degrees][] => h3.cellToBoundary(cell)
/** GeoJSON order, as `LonLat`. */
export const cellBoundaryLonLat = (cell: H3Cell): Ring => h3.cellToBoundary(cell, true)
export const cellArea = (cell: H3Cell): SquareKm => h3.cellArea(cell, h3.UNITS.km2)
export const gridDisk = (cell: H3Cell, rings: number): H3Cell[] => brandCells(h3.gridDisk(cell, rings))
export const gridDiskDistances = (cell: H3Cell, rings: number): H3Cell[][] =>
  h3.gridDiskDistances(cell, rings) as H3Cell[][]
export const gridDistance = (a: H3Cell, b: H3Cell): number => h3.gridDistance(a, b)
export const polygonToCells = (
  polygon: number[][] | number[][][],
  resolution: H3Resolution,
  isGeoJson?: boolean
): H3Cell[] => brandCells(h3.polygonToCells(polygon, resolution, isGeoJson))
export const cellsToMultiPolygon = (cells: H3Cell[], formatAsGeoJson?: boolean) =>
  h3.cellsToMultiPolygon(cells, formatAsGeoJson)
export const edgeLength = (resolution: H3Resolution): Km => h3.getHexagonEdgeLengthAvg(resolution, h3.UNITS.km)
export const getRes0Cells = (): H3Cell[] => brandCells(h3.getRes0Cells())

/** A cell's 64-bit index as its lower and upper 32 bits, for binary paint. */
export const cellToSplitLong = (cell: H3Cell): [low: number, high: number] => h3.h3IndexToSplitLong(cell)

/** The cell with this 64-bit index, or undefined if it is not one: these come from outside. */
export function cellFromSplitLong(lower: number, upper: number): H3Cell | undefined {
  const cell = h3.splitLongToH3Index(lower, upper)
  return h3.isValidCell(cell) ? brandCell(cell) : undefined
}
