import { describe, expect, it } from "vite-plus/test"
import { coarserRes, finerRes, getResolution, h3Cell, h3Res, latLngToCell, resolutionsTo } from "./h3.ts"
import { PaintSubmissionSchema } from "./protocol.ts"

describe("H3 cells and resolutions", () => {
  it("are made only from values of their own format", () => {
    const paris = latLngToCell(48.86, 2.35, h3Res(6))
    expect(h3Cell(paris)).toBe(paris)
    for (const bad of ["", "8628309", "8628309xffffff7", "8628309afffffff0"]) expect(() => h3Cell(bad), bad).toThrow()
    expect(getResolution(paris)).toBe(6)
    for (const bad of [-1, 16, 2.5]) expect(() => h3Res(bad), String(bad)).toThrow()
  })

  it("step one level at a time, and no further than H3 goes", () => {
    expect(finerRes(h3Res(6))).toBe(7)
    expect(coarserRes(h3Res(6))).toBe(5)
    expect(() => finerRes(h3Res(15))).toThrow()
    expect(() => coarserRes(h3Res(0))).toThrow()
    expect(resolutionsTo(2)).toEqual([0, 1, 2])
  })

  it("come out of a paint upload checked", () => {
    const cell = latLngToCell(0, 0, h3Res(5))
    expect(PaintSubmissionSchema.safeParse({ cells: { [cell]: 1 }, floor: 0.05 }).success).toBe(true)
    expect(PaintSubmissionSchema.safeParse({ cells: { paris: 1 }, floor: 0.05 }).success).toBe(false)
  })
})
