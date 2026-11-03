import { describe, expect, it } from "vite-plus/test"
import { stepTitle } from "./step-title.ts"

class Locator {
  readonly selector = "x"
}

describe("stepTitle", () => {
  it("names the class and method alone when there are no arguments", () => {
    expect(stepTitle("HomePage", "expectShown", [])).toBe("HomePage.expectShown")
  })

  it("quotes strings and prints numbers, booleans and undefined as they are", () => {
    expect(stepTitle("RoundPage", "guess", ["Paris", 3, true, undefined])).toBe(
      'RoundPage.guess "Paris", 3, true, undefined'
    )
  })

  it("prints small objects and arrays as compact JSON", () => {
    expect(stepTitle("MapPanel", "paint", [{ x: 1, y: 2 }, [1, 2]])).toBe('MapPanel.paint {"x":1,"y":2}, [1,2]')
  })

  it("shortens long arguments", () => {
    const title = stepTitle("Tab", "go", ["x".repeat(200)])
    expect(title.length).toBeLessThan(80)
    expect(title).toContain("…")
  })

  it("shows functions as fn and other objects as their class name", () => {
    expect(stepTitle("Hud", "wait", [() => 1, new Locator()])).toBe("Hud.wait fn, Locator")
  })
})
