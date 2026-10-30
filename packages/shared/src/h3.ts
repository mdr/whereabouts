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

export const H3CellSchema = z
  .string()
  .regex(/^[0-9a-f]{15}$/)
  .refine((s) => h3.isValidCell(s), "not an H3 cell")
  .brand<"H3Cell">()
export type H3Cell = z.infer<typeof H3CellSchema>
export const h3Cell = (s: string): H3Cell => H3CellSchema.parse(s)

export const H3ResSchema = z.number().int().min(0).max(15).brand<"H3Res">()
export type H3Res = z.infer<typeof H3ResSchema>
export const h3Res = (n: number): H3Res => H3ResSchema.parse(n)

const RESOLUTIONS = Array.from({ length: 16 }, (_, r) => h3Res(r))

/** Resolutions 0 to `max`, coarsest first. */
export const resolutionsTo = (max: number): readonly H3Res[] => RESOLUTIONS.slice(0, max + 1)

/** One level finer, from a table: scoring steps down millions of times. */
export function finerRes(r: H3Res): H3Res {
  const finer = RESOLUTIONS[r + 1]
  if (finer === undefined) throw new RangeError(`no resolution finer than ${r}`)
  return finer
}

/** One level coarser. */
export function coarserRes(r: H3Res): H3Res {
  const coarser = RESOLUTIONS[r - 1]
  if (coarser === undefined) throw new RangeError(`no resolution coarser than ${r}`)
  return coarser
}

const cell = (h: string) => h as H3Cell
const cells = (hs: string[]) => hs as H3Cell[]

/** A record's cells and values: Object.entries would widen its keys to plain strings. */
export const cellEntries = <V>(record: Readonly<Record<H3Cell, V>>): [H3Cell, V][] =>
  Object.entries(record) as [H3Cell, V][]

export const UNITS = h3.UNITS
type Unit = (typeof h3.UNITS)[keyof typeof h3.UNITS]

export const latLngToCell = (lat: number, lng: number, res: H3Res): H3Cell => cell(h3.latLngToCell(lat, lng, res))
export const cellToParent = (h: H3Cell, res: H3Res): H3Cell => cell(h3.cellToParent(h, res))
export const cellToChildren = (h: H3Cell, res: H3Res): H3Cell[] => cells(h3.cellToChildren(h, res))
export const getResolution = (h: H3Cell): H3Res => h3.getResolution(h) as H3Res
export const cellToLatLng = (h: H3Cell) => h3.cellToLatLng(h)
export const cellToBoundary = (h: H3Cell, formatAsGeoJson?: boolean) => h3.cellToBoundary(h, formatAsGeoJson)
export const cellArea = (h: H3Cell, unit: Unit): number => h3.cellArea(h, unit)
export const gridDisk = (h: H3Cell, k: number): H3Cell[] => cells(h3.gridDisk(h, k))
export const gridDiskDistances = (h: H3Cell, k: number): H3Cell[][] => h3.gridDiskDistances(h, k) as H3Cell[][]
export const gridDistance = (a: H3Cell, b: H3Cell): number => h3.gridDistance(a, b)
export const polygonToCells = (polygon: number[][] | number[][][], res: H3Res, isGeoJson?: boolean): H3Cell[] =>
  cells(h3.polygonToCells(polygon, res, isGeoJson))
export const cellsToMultiPolygon = (hs: H3Cell[], formatAsGeoJson?: boolean) =>
  h3.cellsToMultiPolygon(hs, formatAsGeoJson)
export const getHexagonEdgeLengthAvg = (res: H3Res, unit: Unit): number => h3.getHexagonEdgeLengthAvg(res, unit)
export const getRes0Cells = (): H3Cell[] => cells(h3.getRes0Cells())
