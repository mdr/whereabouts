import { describe, expect, it } from "vite-plus/test"
import { strokePoints, touchMove, touchStart, TouchStep } from "./stroke"

describe("strokePoints", () => {
  it("stamps where a stroke starts", () => {
    expect(strokePoints(undefined, { x: 5, y: 7 }, 40)).toEqual([{ x: 5, y: 7 }])
  })

  it("stamps a quarter of the brush apart along a drag, never past where it got to", () => {
    expect(strokePoints({ x: 0, y: 0 }, { x: 35, y: 0 }, 40)).toEqual([
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 }
    ])
  })

  it("waits for a slow drag to cover a step", () => {
    expect(strokePoints({ x: 0, y: 0 }, { x: 6, y: 8 }, 48)).toEqual([])
  })

  it("keeps a tiny brush's stamps at least 2 px apart", () => {
    expect(strokePoints({ x: 0, y: 0 }, { x: 0, y: 5 }, 4)).toHaveLength(2)
  })
})

describe("touch", () => {
  it("paints with one finger when painting is on", () => {
    expect(touchStart(1, true)).toBe(TouchStep.BEGIN)
    expect(touchMove(1, true)).toBe(TouchStep.CONTINUE)
  })

  it("gives a pinch to the map, taking back the stroke its first finger began", () => {
    expect(touchStart(2, true)).toBe(TouchStep.ABANDON)
    expect(touchMove(2, true)).toBe(TouchStep.ABANDON)
  })

  it("leaves one finger to the map when painting is off", () => {
    expect(touchStart(1, false)).toBe(TouchStep.ABANDON)
    expect(touchMove(1, false)).toBe(TouchStep.IGNORE)
  })
})
