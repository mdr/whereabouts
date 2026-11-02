import { gridDisk, latLngToCell, h3Resolution } from "@whereabouts/shared/h3"
import { PAINT_CELL_BUDGET } from "@whereabouts/shared/paint/compact"
import { encodePaint } from "@whereabouts/shared/paint/paint-wire"
import type { PaintPlan } from "./typical-paint.ts"

/** Rings whose disk (3k² + 3k + 1 cells) comes closest to the budget without passing it. */
const RINGS = Math.floor((-3 + Math.sqrt(9 - 12 * (1 - PAINT_CELL_BUDGET))) / 6)
/** The client uploads 400 ms after the last change, so no more often than this. */
const UPLOAD_INTERVAL_MS = 400

/**
 * The worst case: a paint at the cell budget, around a different place for
 * each seed, uploaded as often as a client may for the whole of `paintMs`.
 */
export const budgetPlan = (seed: number, paintMs: number): PaintPlan => {
  const lat = -50 + ((seed * 37) % 100)
  const lon = -170 + ((seed * 71) % 340)
  const centre = latLngToCell(lat, lon, h3Resolution(6))
  const cells = Object.fromEntries(gridDisk(centre, RINGS).map((cell, i) => [cell, 0.2 + ((i * 7919) % 800) / 1000]))
  const bytes = encodePaint({ cells, floor: 0.05 })
  const uploads = Array.from({ length: Math.floor(paintMs / UPLOAD_INTERVAL_MS) }, (_, i) => ({
    atMs: i * UPLOAD_INTERVAL_MS,
    bytes,
    cells: Object.keys(cells).length
  }))
  return { uploads, lockAtMs: paintMs }
}
