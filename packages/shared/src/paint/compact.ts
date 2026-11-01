import { cellArea, cellEntries, cellToParent, getResolution, h3Resolution, type H3Cell } from "../h3.ts"

/** Cells a paint upload may carry: clients compact to it, and the server refuses more. */
export const PAINT_CELL_BUDGET = 6000

/**
 * Coarsen a sparse paint record until it fits the cell budget, merging
 * children into their H3 parent while conserving mass (intensity x area).
 * Scoring treats cells as patches, so a coarser representation of the same
 * mass scores almost identically. Cells end up at mixed resolutions, all at
 * or coarser than the original.
 */
export const compactRecord = (cells: Record<H3Cell, number>, budget = PAINT_CELL_BUDGET): Record<H3Cell, number> => {
  let current = cells
  let count = Object.keys(current).length
  while (count > budget) {
    // Coarsen only the finest resolution present, one level at a time.
    let finest = -1
    for (const [cell] of cellEntries(current)) finest = Math.max(finest, getResolution(cell))
    if (finest <= 0) break
    const next: Record<H3Cell, number> = {}
    const mass = new Map<H3Cell, number>()
    for (const [cell, intensity] of cellEntries(current)) {
      if (getResolution(cell) !== finest) {
        next[cell] = (next[cell] ?? 0) + intensity
        continue
      }
      const parent = cellToParent(cell, h3Resolution(finest - 1))
      mass.set(parent, (mass.get(parent) ?? 0) + intensity * cellArea(cell))
    }
    for (const [parent, parentMass] of mass) {
      next[parent] = (next[parent] ?? 0) + parentMass / cellArea(parent)
    }
    current = next
    count = Object.keys(current).length
  }
  return current
}
