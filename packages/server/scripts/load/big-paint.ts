import { gridDisk, latLngToCell, h3Resolution } from "@whereabouts/shared/h3"
import { PAINT_CELL_BUDGET } from "@whereabouts/shared/paint/compact"
import type { PaintSubmission } from "@whereabouts/shared/protocol/views"

/** Rings whose disk (3k² + 3k + 1 cells) comes closest to the budget without passing it. */
const RINGS = Math.floor((-3 + Math.sqrt(9 - 12 * (1 - PAINT_CELL_BUDGET))) / 6)

/** A paint at the cell budget, around a different place for each seed: the largest upload a client sends. */
export const bigPaint = (seed: number): PaintSubmission => {
  const lat = -50 + ((seed * 37) % 100)
  const lon = -170 + ((seed * 71) % 340)
  const centre = latLngToCell(lat, lon, h3Resolution(6))
  const cells = Object.fromEntries(gridDisk(centre, RINGS).map((cell, i) => [cell, 0.2 + ((i * 7919) % 800) / 1000]))
  return { cells, floor: 0.05 }
}
