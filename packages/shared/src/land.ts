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
import {
  cellArea,
  cellToChildren,
  cellToParent,
  getResolution,
  UNITS,
  h3Cell,
  h3Res,
  resolutionsTo,
  type H3Cell,
  type H3Res
} from "./h3.ts"

export interface LandMaskData {
  /** The mask's finest resolution. */
  res: number
  /** Compacted cells: each at res or coarser. */
  cells: string[]
}

export class LandMask {
  /** The mask's finest resolution. */
  readonly res: H3Res
  private readonly cells: Set<H3Cell>
  /** Every strict ancestor of a mask cell: a coarse cell with land somewhere inside. */
  private readonly ancestors = new Set<H3Cell>()

  constructor(data: LandMaskData) {
    this.res = h3Res(data.res)
    this.cells = new Set(data.cells.map(h3Cell))
    for (const h of this.cells)
      for (const r of resolutionsTo(getResolution(h) - 1)) this.ancestors.add(cellToParent(h, r))
  }

  /** Whether any of this cell is within the mask. */
  nearLand(h: H3Cell): boolean {
    const r = getResolution(h)
    for (const k of resolutionsTo(Math.min(r, this.res)))
      if (this.cells.has(k === r ? h : cellToParent(h, k))) return true
    return r < this.res && this.ancestors.has(h)
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
export function trimSea(cells: ReadonlyMap<H3Cell, number>, mask: LandMask, finestRes: H3Res): Map<H3Cell, number> {
  return keepCells(cells, (h) => mask.nearLand(h), h3Res(Math.min(mask.res, finestRes)))
}

/**
 * The mask behind "Trim land", in a lake or sea round: the H3 res-5 cells
 * wholly on land and touching no lake, compacted (water.json, built by
 * scripts/build-water.mjs). The land mask cannot serve, since lakes are land
 * in it. Paint within a cell of water stays, as paint within a cell of land
 * stays when trimming the sea.
 */
export interface WaterMaskData {
  res: number
  /** Compacted cells: each at res or coarser. */
  dry: string[]
}

export class WaterMask {
  readonly res: H3Res
  private readonly dry: Set<H3Cell>

  constructor(data: WaterMaskData) {
    this.res = h3Res(data.res)
    this.dry = new Set(data.dry.map(h3Cell))
  }

  /** Whether any of this cell is outside the dry cells. Compaction puts any cell wholly dry, or an ancestor, in the set. */
  nearWater(h: H3Cell): boolean {
    const r = getResolution(h)
    for (const k of resolutionsTo(Math.min(r, this.res)))
      if (this.dry.has(k === r ? h : cellToParent(h, k))) return false
    return true
  }
}

/** The paint without its cells on dry land, split as trimSea splits. */
export function trimLand(cells: ReadonlyMap<H3Cell, number>, mask: WaterMask, finestRes: H3Res): Map<H3Cell, number> {
  return keepCells(cells, (h) => mask.nearWater(h), h3Res(Math.min(mask.res, finestRes)))
}

/**
 * The paint in the cells `keep` accepts. A cell coarser than `target` that
 * `keep` accepts only some children of is split into those children.
 */
export function keepCells(
  cells: ReadonlyMap<H3Cell, number>,
  keep: (h: H3Cell) => boolean,
  target: H3Res
): Map<H3Cell, number> {
  const kept = new Map<H3Cell, number>()
  const add = (h: H3Cell, v: number) => kept.set(h, (kept.get(h) ?? 0) + v)
  for (const [h, v] of cells) {
    if (!keep(h)) continue
    if (getResolution(h) >= target) {
      add(h, v)
      continue
    }
    const children = cellToChildren(h, target)
    const wanted = children.filter(keep)
    if (wanted.length === children.length) add(h, v)
    else for (const c of wanted) add(c, v)
  }
  return kept
}

/** How much paint there is, in intensity × km²: intensity is a density, so a cell holds intensity times its area. */
export function paintAmount(cells: ReadonlyMap<H3Cell, number>): number {
  let sum = 0
  for (const [h, v] of cells) sum += v * cellArea(h, UNITS.km2)
  return sum
}
