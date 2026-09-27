/**
 * The land mask behind the "Trim sea" button: the H3 cells at a fixed
 * resolution that touch land, plus a ring around them, compacted (land.json,
 * built by scripts/build-land.mjs). A painted cell of any resolution is
 * "near land" when it overlaps the mask; trimming keeps only those. Paint
 * more than about 50 km from any land goes, and coasts and islands keep all
 * theirs.
 *
 * Trimming is the player's choice, like the eraser, not a free gain: every
 * answer is on land, but a blob centred on a coastal answer loses its sea
 * side and leans inland, which the point rule scores lower (Cape Town, 899
 * down to 881, in testing). Whole countries nearly always gain.
 */
import { cellToParent, getResolution } from "h3-js";

export interface LandMaskData {
  /** The mask's finest resolution. */
  res: number;
  /** Compacted cells: each at res or coarser. */
  cells: string[];
}

export class LandMask {
  private readonly res: number;
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

/** The paint without its cells out at sea; the same map when there are none. */
export function trimSea(cells: ReadonlyMap<string, number>, mask: LandMask): Map<string, number> {
  const kept = new Map<string, number>();
  for (const [h, v] of cells) if (mask.nearLand(h)) kept.set(h, v);
  return kept;
}
