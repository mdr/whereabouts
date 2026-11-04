import { describe, expect, it } from "vite-plus/test"
import { radioTabStopIndex, radioTargetIndex } from "./radio-group"

describe("radioTargetIndex", () => {
  it("moves forwards with Right and Down, wrapping", () => {
    expect(radioTargetIndex("ArrowRight", 1, 4)).toBe(2)
    expect(radioTargetIndex("ArrowDown", 3, 4)).toBe(0)
  })

  it("moves backwards with Left and Up, wrapping", () => {
    expect(radioTargetIndex("ArrowLeft", 2, 4)).toBe(1)
    expect(radioTargetIndex("ArrowUp", 0, 4)).toBe(3)
  })

  it("goes to the ends with Home and End", () => {
    expect(radioTargetIndex("Home", 2, 4)).toBe(0)
    expect(radioTargetIndex("End", 1, 4)).toBe(3)
  })

  it("ignores other keys and empty groups", () => {
    expect(radioTargetIndex("a", 1, 4)).toBeUndefined()
    expect(radioTargetIndex("Tab", 1, 4)).toBeUndefined()
    expect(radioTargetIndex("ArrowRight", 0, 0)).toBeUndefined()
  })
})

describe("radioTabStopIndex", () => {
  it("is the checked option", () => expect(radioTabStopIndex(2)).toBe(2))
  it("is the first option when none is checked", () => expect(radioTabStopIndex(-1)).toBe(0))
})
