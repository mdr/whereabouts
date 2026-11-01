/**
 * The Fill tool: paint a whole country with one click, in a round that asks
 * for a country on the Political map. A fill is an even coat (FILL_DENSITY)
 * of the cells whose centres are in the country, so filling several
 * countries weighs each by its area, as covering them by hand would.
 *
 * The cells are all at one resolution: as fine as the layer allows, within
 * FILL_CELL_BUDGET. A country round fills at its own resolution (Bulgaria
 * 410 cells, Chile 3106), so a correct fill scores about 999; filling Russia
 * on a small country's fine grid would be millions of cells, so a big
 * country gets coarser cells. They are not compacted (seven merged into
 * their parent): a parent is a hexagon turned about 19° from its children,
 * so merged cells drew with gaps between them, about 3% of the fill, though
 * the score, which spreads a parent over its children, never saw them. A
 * country too small to hold a cell
 * centre (Tuvalu, on a coarse grid) is filled around its answer instead, out
 * to its `near` distance, or just the cell its answer is in.
 */
import { edgeLength, gridDisk, latLngToCell, polygonToCells, finerRes, h3Res, type H3Cell, type H3Res } from "../h3.ts"
import type { LatLon, Ring } from "../geo.ts"
import type { Outline } from "../questions.ts"
import type { Km } from "../units.ts"

/** The density of a fill: equal for every country filled. */
export const FILL_DENSITY = 1

/** The most cells one country's fill is painted with: two thirds of the paint budget. */
export const FILL_CELL_BUDGET = 4000

export enum FillShapeType {
  OUTLINE = "OUTLINE",
  RINGS = "RINGS"
}

/** A country's shape: its outline, or only bare rings, taken even-odd. */
export type FillShape = OutlineFill | RingsFill

interface OutlineFill extends FillBase {
  type: FillShapeType.OUTLINE
  outline: Outline
}

/** Rings with no outer/hole structure: a cell is in the country when its centre is in an odd number of them. */
interface RingsFill extends FillBase {
  type: FillShapeType.RINGS
  rings: Ring[]
}

interface FillBase {
  /** Its answer, for a country too small to hold a cell. */
  answer: LatLon
  /** For a small country: how far from its answer counts as the country. */
  near?: Km
}

function cellsAt(shape: FillShape, res: H3Res): H3Cell[] {
  switch (shape.type) {
    case FillShapeType.OUTLINE: {
      const out = new Set<H3Cell>()
      for (const p of shape.outline) for (const h of polygonToCells(p, res, true)) out.add(h)
      return [...out]
    }
    case FillShapeType.RINGS: {
      const parity = new Map<H3Cell, boolean>()
      for (const r of shape.rings) for (const h of polygonToCells([r], res, true)) parity.set(h, !parity.get(h))
      return [...parity].filter(([, odd]) => odd).map(([h]) => h)
    }
  }
}

/** The cells filling a country, all at one resolution, never finer than `finestRes`. */
export function countryFill(shape: FillShape, finestRes: H3Res): H3Cell[] {
  // Step finer while the next level stays in budget. It has about 7 times
  // the cells, so a level far over is not even laid out.
  let res = h3Res(0)
  let cells = cellsAt(shape, res)
  while (res < finestRes && cells.length * 7 <= 2 * FILL_CELL_BUDGET) {
    const next = finerRes(res)
    const finer = cellsAt(shape, next)
    if (finer.length > FILL_CELL_BUDGET) break
    ;[res, cells] = [next, finer]
  }
  if (cells.length === 0) {
    const centre = latLngToCell(shape.answer.lat, shape.answer.lon, res)
    const spacing = edgeLength(res) * Math.sqrt(3)
    cells = gridDisk(centre, shape.near ? Math.round(shape.near / spacing) : 0)
  }
  return cells
}
