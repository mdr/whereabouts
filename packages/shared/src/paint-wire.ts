/**
 * Paint on the wire, in binary: the floor as a float64, then for each cell
 * its 64-bit H3 index (lower and upper uint32) and its intensity (float32),
 * all little-endian. A third the size of the same paint as JSON, and the
 * cell count follows from the length, so an oversized upload is refused
 * before any of it is read.
 */
import { cellEntries, cellFromSplitLong, cellToSplitLong, type H3Cell } from "./h3.ts"
import { PAINT_CELL_BUDGET } from "./paint.ts"
import type { PaintSubmission } from "./protocol.ts"

const HEADER_BYTES = 8
const CELL_BYTES = 12

/** Far beyond any real brush, so scoring's intensity x area can neither overflow nor underflow into NaN. */
const MIN_INTENSITY = 1e-30
const MAX_INTENSITY = 1e9

export function encodePaint(paint: PaintSubmission): Uint8Array {
  const entries = cellEntries(paint.cells)
  const view = new DataView(new ArrayBuffer(HEADER_BYTES + entries.length * CELL_BYTES))
  view.setFloat64(0, paint.floor, true)
  entries.forEach(([h, v], i) => {
    const at = HEADER_BYTES + i * CELL_BYTES
    const [lower, upper] = cellToSplitLong(h)
    view.setUint32(at, lower, true)
    view.setUint32(at + 4, upper, true)
    view.setFloat32(at + 8, v, true)
  })
  return new Uint8Array(view.buffer)
}

/** The paint in these bytes, or undefined unless every cell is real and the whole is within bounds. */
export function decodePaint(bytes: Uint8Array): PaintSubmission | undefined {
  const count = (bytes.byteLength - HEADER_BYTES) / CELL_BYTES
  if (!Number.isInteger(count) || count < 0 || count > PAINT_CELL_BUDGET) return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const floor = view.getFloat64(0, true)
  if (!(floor >= 0 && floor <= 1)) return undefined
  const cells: Record<H3Cell, number> = {}
  for (let i = 0; i < count; i++) {
    const at = HEADER_BYTES + i * CELL_BYTES
    const h = cellFromSplitLong(view.getUint32(at, true), view.getUint32(at + 4, true))
    const v = view.getFloat32(at + 8, true)
    if (h === undefined || !(v >= MIN_INTENSITY && v <= MAX_INTENSITY)) return undefined
    cells[h] = v
  }
  return { cells, floor }
}

/** Binary paint as text, to travel inside JSON (the reveal). */
export function paintToBase64(paint: PaintSubmission): string {
  const bytes = encodePaint(paint)
  let bin = ""
  // In chunks: spreading a whole large paint into one call overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export function paintFromBase64(text: string): PaintSubmission | undefined {
  try {
    return decodePaint(Uint8Array.from(atob(text), (c) => c.charCodeAt(0)))
  } catch {
    return undefined
  }
}
