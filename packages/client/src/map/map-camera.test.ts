import { describe, expect, it } from "vite-plus/test"
import { revealPadding } from "./map-camera"

describe("revealPadding", () => {
  it("leaves room for the side cards and the toolbar on a wide screen", () => {
    expect(revealPadding({ width: 1600, height: 900, phone: false, questionCardHeight: 0 })).toEqual({
      top: 40,
      bottom: 90,
      left: 340,
      right: 340
    })
  })

  it("gives a narrow window less than the cards take", () => {
    const { left, right } = revealPadding({ width: 800, height: 600, phone: false, questionCardHeight: 0 })
    expect(left).toBe(240)
    expect(right).toBe(240)
  })

  it("on a phone, fits between the question card and the sheet", () => {
    expect(revealPadding({ width: 390, height: 800, phone: true, questionCardHeight: 100 })).toEqual({
      top: 172,
      bottom: 416,
      left: 24,
      right: 24
    })
  })
})
