import { describe, expect, it } from "vite-plus/test"
import { EARTH_RADIUS } from "@whereabouts/shared/geo"
import { Hand } from "../hands/hand"
import { groundRadius, nextTool, offeredTool, STILL_STAMP, stampDue } from "./spray-rules"
import { Tool } from "../../paint/tool"

describe("a spot's ground radius", () => {
  it("is its share of the globe's radius, of the Earth's", () => {
    expect(groundRadius(0.01, 0.3)).toBeCloseTo((0.01 / 0.3) * EARTH_RADIUS, 6)
  })

  it("shrinks as the globe is zoomed in", () => {
    expect(groundRadius(0.01, 1.2)).toBeCloseTo(groundRadius(0.01, 0.3) / 4, 6)
  })

  it("stays between 1 and 3000 km", () => {
    expect(groundRadius(0.0001, 100)).toBe(1)
    expect(groundRadius(1, 0.3)).toBe(3000)
  })
})

describe("a stroke's stamps", () => {
  const here = { lat: 0, lon: 0 }
  // A degree of longitude at the equator is about 111 km.
  const last = { at: here, time: 10 }

  it("start with the first", () => {
    expect(stampDue(undefined, here, 100, 10)).toBe(true)
  })

  it("wait until the spray has moved a quarter of its radius", () => {
    expect(stampDue(last, { lat: 0, lon: 0.2 }, 100, 10.01)).toBe(false)
    expect(stampDue(last, { lat: 0, lon: 0.3 }, 100, 10.01)).toBe(true)
  })

  it("keep coming while it is held still", () => {
    expect(stampDue(last, here, 100, 10 + STILL_STAMP / 2)).toBe(false)
    expect(stampDue(last, here, 100, 10 + STILL_STAMP)).toBe(true)
  })
})

describe("a hand's tools", () => {
  it("step from spray can to eraser and back", () => {
    expect(nextTool(Tool.PAINT, false)).toBe(Tool.ERASE)
    expect(nextTool(Tool.ERASE, false)).toBe(Tool.PAINT)
  })

  it("include the pail on a round that can be filled", () => {
    expect(nextTool(Tool.ERASE, true)).toBe(Tool.FILL)
    expect(nextTool(Tool.FILL, true)).toBe(Tool.PAINT)
  })

  it("go back to each hand's usual tool when the pail is no longer offered", () => {
    expect(offeredTool(Tool.FILL, false, Hand.RIGHT)).toBe(Tool.PAINT)
    expect(offeredTool(Tool.FILL, false, Hand.LEFT)).toBe(Tool.ERASE)
    expect(offeredTool(Tool.FILL, true, Hand.LEFT)).toBe(Tool.FILL)
    expect(offeredTool(Tool.ERASE, false, Hand.RIGHT)).toBe(Tool.ERASE)
  })
})
