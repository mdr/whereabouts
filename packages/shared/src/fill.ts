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
import { getHexagonEdgeLengthAvg, gridDisk, latLngToCell, polygonToCells, UNITS } from "h3-js";
import type { LatLon } from "./geo.ts";

/** The density of a fill: equal for every country filled. */
export const FILL_DENSITY = 1;

/** The most cells one country's fill is painted with: two thirds of the paint budget. */
export const FILL_CELL_BUDGET = 4000;

/** What a country is filled with. */
export interface FillShape {
  /** GeoJSON MultiPolygon coordinates ([lon, lat] rings, outer first), or plain rings taken even-odd. */
  polygons?: number[][][][];
  rings?: number[][][];
  /** Its answer, for a country too small to hold a cell. */
  answer: LatLon;
  /** For a small country: how far from its answer counts as the country, km. */
  near?: number;
}

function cellsAt(shape: FillShape, res: number): string[] {
  if (shape.polygons) {
    const out = new Set<string>();
    for (const p of shape.polygons) for (const h of polygonToCells(p, res, true)) out.add(h);
    return [...out];
  }
  // Plain rings: a cell is in the country when its centre is in an odd number of them.
  const parity = new Map<string, boolean>();
  for (const r of shape.rings ?? []) for (const h of polygonToCells([r], res, true)) parity.set(h, !parity.get(h));
  return [...parity].filter(([, odd]) => odd).map(([h]) => h);
}

/** The cells filling a country, all at one resolution, never finer than `finestRes`. */
export function countryFill(shape: FillShape, finestRes: number): string[] {
  // Step finer while the next level stays in budget. It has about 7 times
  // the cells, so a level far over is not even laid out.
  let res = 0;
  let cells = cellsAt(shape, 0);
  while (res < finestRes && cells.length * 7 <= 2 * FILL_CELL_BUDGET) {
    const finer = cellsAt(shape, res + 1);
    if (finer.length > FILL_CELL_BUDGET) break;
    [res, cells] = [res + 1, finer];
  }
  if (cells.length === 0) {
    const centre = latLngToCell(shape.answer.lat, shape.answer.lon, res);
    const spacing = getHexagonEdgeLengthAvg(res, UNITS.km) * Math.sqrt(3);
    cells = gridDisk(centre, shape.near ? Math.round(shape.near / spacing) : 0);
  }
  return cells;
}
