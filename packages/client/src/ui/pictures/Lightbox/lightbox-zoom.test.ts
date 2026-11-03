import { describe, expect, it } from "vite-plus/test"
import { CLICK_ZOOM, MAX_ZOOM, nextZoom } from "./lightbox-zoom"

const fit = { zoom: 1, pan: { x: 0, y: 0 } }

describe("nextZoom", () => {
  it("zooms by the factor", () => {
    expect(nextZoom(fit, CLICK_ZOOM, { x: 0, y: 0 })?.zoom).toBe(2.5)
  })

  it("keeps the anchor fixed: the picture moves away from it as it grows", () => {
    expect(nextZoom(fit, 2, { x: 100, y: -40 })).toEqual({ zoom: 2, pan: { x: -100, y: 40 } })
  })

  it("scales the pan already made about the anchor", () => {
    expect(nextZoom({ zoom: 2, pan: { x: 30, y: 10 } }, 2, { x: 0, y: 0 })).toEqual({
      zoom: 4,
      pan: { x: 60, y: 20 }
    })
  })

  it("stops at the largest zoom", () => {
    expect(nextZoom({ zoom: 4, pan: { x: 0, y: 0 } }, 10, { x: 0, y: 0 })?.zoom).toBe(MAX_ZOOM)
    expect(nextZoom({ zoom: MAX_ZOOM, pan: { x: 5, y: 5 } }, 2, { x: 0, y: 0 })).toBeUndefined()
  })

  it("stops at fit, centred", () => {
    expect(nextZoom({ zoom: 2, pan: { x: 30, y: 10 } }, 0.1, { x: 50, y: 50 })).toEqual({
      zoom: 1,
      pan: { x: 0, y: 0 }
    })
    expect(nextZoom(fit, 0.5, { x: 0, y: 0 })).toBeUndefined()
  })
})
