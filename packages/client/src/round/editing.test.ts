import { describe, expect, it } from "vite-plus/test"
import type { GuessingYouView } from "@whereabouts/shared/protocol"
import { canPaint, canUnlock } from "./editing"
import { makeGuessingView, makeRevealView } from "../test-view"

const guessing = (you: Partial<GuessingYouView> = {}) => makeGuessingView({ you })

describe("canPaint", () => {
  it("lets a player paint while guessing", () => {
    expect(canPaint(guessing(), false)).toBe(true)
  })

  it.each([
    ["once Done", guessing({ locked: true }), false],
    ["once time is up", guessing(), true],
    ["while watching", guessing({ watching: true, sittingOut: true }), false],
    ["while sitting out a round joined late", guessing({ sittingOut: true }), false],
    ["at the reveal", makeRevealView(), false]
  ])("does not let you paint %s", (_, view, timeUp) => {
    expect(canPaint(view, timeUp)).toBe(false)
  })
})

describe("canUnlock", () => {
  it("lets you take back Done while time is left", () => {
    expect(canUnlock(guessing({ locked: true }), false)).toBe(true)
  })

  it.each([
    ["once time is up", guessing({ locked: true }), true],
    ["before Done", guessing(), false],
    ["at the reveal", makeRevealView({ you: { locked: true } }), false]
  ])("does not let you take back Done %s", (_, view, timeUp) => {
    expect(canUnlock(view, timeUp)).toBe(false)
  })
})
