import { describe, expect, it } from "vite-plus/test"
import { playerId } from "@whereabouts/shared/ids"
import { FOCUS_ALL, PaintFocusType } from "./paint-focus"
import { paintFocusStyle } from "./paint-focus-style"
import { PLAYER_OPACITY } from "./player-ramp"

const alice = playerId("p1")

describe("paintFocusStyle", () => {
  it("draws everyone unfiltered", () => {
    expect(paintFocusStyle(FOCUS_ALL)).toEqual({ filter: undefined, opacity: PLAYER_OPACITY })
  })

  it("filters to one player, or to none", () => {
    expect(paintFocusStyle({ type: PaintFocusType.ONLY, player: alice }).filter).toEqual([
      "==",
      ["get", "player"],
      alice
    ])
    expect(paintFocusStyle({ type: PaintFocusType.NONE }).filter).toEqual(["boolean", false])
  })

  it("highlights one player by dimming the rest, keeping all drawn", () => {
    const { filter, opacity } = paintFocusStyle({ type: PaintFocusType.HIGHLIGHT, player: alice })
    expect(filter).toBeUndefined()
    expect(opacity).toEqual(["case", ["==", ["get", "player"], alice], PLAYER_OPACITY, ["*", 0.15, PLAYER_OPACITY]])
  })
})
