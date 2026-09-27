/**
 * The Fill tool: paint a whole country with one click, in a round that asks
 * for a country on the Political map. A fill is an even coat (FILL_DENSITY)
 * of the cells whose centres are in the country, so filling several
 * countries weighs each by its area, as covering them by hand would.
 *
 * The cells are as fine as the layer allows, so a correct fill of a painted
 * country scores 970 to 999, while compacted (whole groups of seven merged
 * into their parent, so the interior costs little) they stay within
 * FILL_CELL_BUDGET, and no more than FILL_RAW_LIMIT are laid out at once:
 * filling Russia on a small country's fine grid would be millions of cells,
 * so a big country gets a coarser edge. A country too small to hold a cell
 * centre (Tuvalu, on a coarse grid) is filled around its answer instead, out
 * to its `near` distance, or just the cell its answer is in.
 */
import { compactCells, getHexagonEdgeLengthAvg, gridDisk, latLngToCell, polygonToCells, UNITS } from "h3-js";
import type { LatLon } from "./geo.ts";

/** The density of a fill: equal for every country filled. */
export const FILL_DENSITY = 1;

/** The most cells one country's fill is painted with, compacted: half the paint budget. */
export const FILL_CELL_BUDGET = 3000;
/** The most cells laid out at one resolution before compacting, to bound the work. */
export const FILL_RAW_LIMIT = 40_000;

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

/** The cells filling a country, compacted, never finer than `finestRes`. */
export function countryFill(shape: FillShape, finestRes: number): string[] {
  // Step finer while the next level (about 7 times the cells) stays in bounds.
  let res = 0;
  let cells = cellsAt(shape, 0);
  let compact = cells;
  while (res < finestRes && cells.length * 7 <= FILL_RAW_LIMIT) {
    const finer = cellsAt(shape, res + 1);
    const finerCompact = compactCells(finer);
    if (finerCompact.length > FILL_CELL_BUDGET) break;
    [res, cells, compact] = [res + 1, finer, finerCompact];
  }
  if (cells.length === 0) {
    const centre = latLngToCell(shape.answer.lat, shape.answer.lon, res);
    const spacing = getHexagonEdgeLengthAvg(res, UNITS.km) * Math.sqrt(3);
    cells = gridDisk(centre, shape.near ? Math.round(shape.near / spacing) : 0);
    compact = compactCells(cells);
  }
  return compact;
}
