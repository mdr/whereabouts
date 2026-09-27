/**
 * The land mask behind the "Trim sea" button: the H3 res-5 cells (about
 * 17 km across) that touch land, compacted (land.json, built by
 * scripts/build-land.mjs). A painted cell of any resolution is "near land"
 * when it overlaps the mask; trimming keeps only those. Around Italy that
 * kept 82% of sea paint within 10 km of land, 17% at 10 to 20 km, and none
 * beyond. Paint is never finer than its question's painting resolution, so
 * the painted cell holding an answer always holds land too: no answer is
 * trimmed, even one between islands (a test checks every answer).
 *
 * Trimming is the player's choice, like the eraser, not a free gain: a blob
 * centred on a coastal answer loses its sea side and leans inland, which the
 * point rule scores lower (Malta, painted twice its tolerance across, 899
 * down to 815 in testing; Cape Town 899 to 866), while island and flag
 * answers often gain (Palau's flag 900 to 992). Whole countries nearly
 * always gain.
 */
import { cellArea, cellToChildren, cellToParent, getResolution, UNITS } from "h3-js";

export interface LandMaskData {
  /** The mask's finest resolution. */
  res: number;
  /** Compacted cells: each at res or coarser. */
  cells: string[];
}

export class LandMask {
  /** The mask's finest resolution. */
  readonly res: number;
  private readonly cells: Set<string>;
  /** Every strict ancestor of a mask cell: a coarse cell with land somewhere inside. */
  private readonly ancestors = new Set<string>();

  constructor(data: LandMaskData) {
    this.res = data.res;
    this.cells = new Set(data.cells);
    for (const h of data.cells) for (let r = 0; r < getResolution(h); r++) this.ancestors.add(cellToParent(h, r));
  }

  /** Whether any of this cell is within the mask. */
  nearLand(h: string): boolean {
    const r = getResolution(h);
    for (let k = 0; k <= Math.min(r, this.res); k++) if (this.cells.has(k === r ? h : cellToParent(h, k))) return true;
    return r < this.res && this.ancestors.has(h);
  }
}

/**
 * The paint without its cells out at sea. A cell coarser than the mask that
 * is partly at sea (a big brush at world zoom lays cells 100 km across) is
 * split into its children that are near land, at the same density: the
 * mask's resolution, or the layer's finest (`finestRes`) if that is
 * coarser, since paint is never finer than its layer. Where a split child
 * meets a painted cell of its own, their densities add, as overlapping
 * cells always do.
 */
export function trimSea(cells: ReadonlyMap<string, number>, mask: LandMask, finestRes: number): Map<string, number> {
  const target = Math.min(mask.res, finestRes);
  const kept = new Map<string, number>();
  const add = (h: string, v: number) => kept.set(h, (kept.get(h) ?? 0) + v);
  for (const [h, v] of cells) {
    if (!mask.nearLand(h)) continue;
    if (getResolution(h) >= target) {
      add(h, v);
      continue;
    }
    const children = cellToChildren(h, target);
    const land = children.filter((c) => mask.nearLand(c));
    if (land.length === children.length) add(h, v);
    else for (const c of land) add(c, v);
  }
  return kept;
}

/** How much paint there is, in intensity × km²: intensity is a density, so a cell holds intensity times its area. */
export function paintAmount(cells: ReadonlyMap<string, number>): number {
  let sum = 0;
  for (const [h, v] of cells) sum += v * cellArea(h, UNITS.km2);
  return sum;
}
