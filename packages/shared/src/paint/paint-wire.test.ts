import { describe, expect, it } from "vite-plus/test"
import { cellEntries, gridDisk, h3Res, latLngToCell, type H3Cell } from "../h3.ts"
import { PAINT_CELL_BUDGET } from "./compact.ts"
import { decodePaint, encodePaint, paintFromBase64, paintToBase64 } from "./paint-wire.ts"
import type { PaintSubmission } from "../protocol/views.ts"

const paris = latLngToCell(48.86, 2.35, h3Res(6))
const paint = (cells: Record<H3Cell, number>, floor = 0.05): PaintSubmission => ({ cells, floor })

describe("binary paint", () => {
  it("round-trips, intensities to float32 precision", () => {
    const cells = Object.fromEntries(gridDisk(paris, 3).map((cell, i) => [cell, 0.1 + i / 7]))
    const back = decodePaint(encodePaint(paint(cells, 0.07)))!
    expect(back.floor).toBe(0.07)
    expect(Object.keys(back.cells).sort()).toEqual(Object.keys(cells).sort())
    for (const [cell, value] of cellEntries(cells)) expect(back.cells[cell]).toBeCloseTo(value, 6)
    expect(decodePaint(encodePaint(paint({}, 1)))).toEqual(paint({}, 1))
  })

  it("reads paint that starts part way into its buffer", () => {
    const layer = paint({ [paris]: 0.5 })
    const bytes = encodePaint(layer)
    const framed = new Uint8Array(bytes.length + 3)
    framed.set(bytes, 3)
    expect(decodePaint(framed.subarray(3))).toEqual(layer)
  })

  it("takes 12 bytes a cell, after an 8-byte floor", () => {
    expect(encodePaint(paint({ [paris]: 1 })).byteLength).toBe(20)
  })

  it("refuses a length that is not whole cells, and more cells than the budget", () => {
    expect(decodePaint(new Uint8Array(13))).toBeUndefined()
    expect(decodePaint(new Uint8Array(4))).toBeUndefined()
    const many = gridDisk(paris, 45).slice(0, PAINT_CELL_BUDGET + 1)
    expect(decodePaint(encodePaint(paint(Object.fromEntries(many.map((cell) => [cell, 1])))))).toBeUndefined()
  })

  it("refuses a cell that is not one", () => {
    const bytes = encodePaint(paint({ [paris]: 1 }))
    bytes.fill(0xff, 8, 16)
    expect(decodePaint(bytes)).toBeUndefined()
  })

  it("refuses intensities and floors scoring cannot take", () => {
    // Too big or too small, scoring's intensity x area overflows or underflows into a NaN score.
    for (const value of [0, -1, 1e10, 1e-35, NaN, Infinity]) {
      expect(decodePaint(encodePaint(paint({ [paris]: value }))), String(value)).toBeUndefined()
    }
    for (const floor of [-0.1, 1.5, NaN])
      expect(decodePaint(encodePaint(paint({}, floor))), String(floor)).toBeUndefined()
  })

  it("travels inside JSON as base64", () => {
    const p = paint({ [paris]: 0.5 })
    expect(paintFromBase64(paintToBase64(p))).toEqual(p)
    expect(paintFromBase64("not base64!")).toBeUndefined()
  })

  it("travels as base64 when it is larger than one chunk", () => {
    // About 3,000 cells: 36 KB, over the 32 KB chunk the encoder works in.
    const cells = Object.fromEntries(gridDisk(paris, 31).map((cell) => [cell, 0.5]))
    expect(encodePaint(paint(cells)).byteLength).toBeGreaterThan(0x8000)
    expect(paintFromBase64(paintToBase64(paint(cells)))).toEqual(paint(cells))
  })
})
