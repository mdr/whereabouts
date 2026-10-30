import { describe, expect, it } from "vite-plus/test"
import { cellEntries, gridDisk, h3Res, latLngToCell, type H3Cell } from "./h3.ts"
import { PAINT_CELL_BUDGET } from "./paint.ts"
import { decodePaint, encodePaint, paintFromBase64, paintToBase64 } from "./paint-wire.ts"
import type { PaintSubmission } from "./protocol.ts"

const paris = latLngToCell(48.86, 2.35, h3Res(6))
const paint = (cells: Record<H3Cell, number>, floor = 0.05): PaintSubmission => ({ cells, floor })

describe("binary paint", () => {
  it("round-trips, intensities to float32 precision", () => {
    const cells = Object.fromEntries(gridDisk(paris, 3).map((h, i) => [h, 0.1 + i / 7]))
    const back = decodePaint(encodePaint(paint(cells, 0.07)))!
    expect(back.floor).toBe(0.07)
    expect(Object.keys(back.cells).sort()).toEqual(Object.keys(cells).sort())
    for (const [h, v] of cellEntries(cells)) expect(back.cells[h]).toBeCloseTo(v, 6)
    expect(decodePaint(encodePaint(paint({}, 1)))).toEqual(paint({}, 1))
  })

  it("takes 12 bytes a cell, after an 8-byte floor", () => {
    expect(encodePaint(paint({ [paris]: 1 })).byteLength).toBe(20)
  })

  it("refuses a length that is not whole cells, and more cells than the budget", () => {
    expect(decodePaint(new Uint8Array(13))).toBeUndefined()
    expect(decodePaint(new Uint8Array(4))).toBeUndefined()
    const many = gridDisk(paris, 45).slice(0, PAINT_CELL_BUDGET + 1)
    expect(decodePaint(encodePaint(paint(Object.fromEntries(many.map((h) => [h, 1])))))).toBeUndefined()
  })

  it("refuses a cell that is not one", () => {
    const bytes = encodePaint(paint({ [paris]: 1 }))
    bytes.fill(0xff, 8, 16)
    expect(decodePaint(bytes)).toBeUndefined()
  })

  it("refuses intensities and floors scoring cannot take", () => {
    // Too big or too small, scoring's intensity x area overflows or underflows into a NaN score.
    for (const v of [0, -1, 1e10, 1e-35, NaN, Infinity]) {
      expect(decodePaint(encodePaint(paint({ [paris]: v }))), String(v)).toBeUndefined()
    }
    for (const floor of [-0.1, 1.5, NaN])
      expect(decodePaint(encodePaint(paint({}, floor))), String(floor)).toBeUndefined()
  })

  it("travels inside JSON as base64", () => {
    const p = paint({ [paris]: 0.5 })
    expect(paintFromBase64(paintToBase64(p))).toEqual(p)
    expect(paintFromBase64("not base64!")).toBeUndefined()
  })
})
