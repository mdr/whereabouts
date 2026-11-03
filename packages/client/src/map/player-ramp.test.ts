import { describe, expect, it } from "vite-plus/test"
import { PLAYER_COLOURS } from "@whereabouts/shared/colours"
import { playerRamp, playerRampAt } from "./player-ramp"

describe("playerRamp", () => {
  it("runs from a dark shade of the colour to a pale tint of it", () => {
    expect(playerRamp("#4fc3f7")).toEqual({ shade: "#24586f", colour: "#4fc3f7", tint: "#9edefb" })
  })

  it("is the shade and faint at the lightest paint, the colour halfway, the tint and strong at the heaviest", () => {
    const ramp = playerRamp("#4fc3f7")
    expect(playerRampAt(ramp, 0)).toEqual({ colour: [36, 88, 111], opacity: 0.15 })
    expect(playerRampAt(ramp, 0.5).colour).toEqual([79, 195, 247])
    expect(playerRampAt(ramp, 1)).toEqual({ colour: [158, 222, 251], opacity: 0.9 })
  })

  it("stops the tint short of white, so no two players' heaviest paint is the same", () => {
    const tints = PLAYER_COLOURS.filter((colour) => colour !== "#ffffff").map((colour) => playerRamp(colour).tint)
    expect(tints).not.toContain("#ffffff")
    expect(new Set(tints).size).toBe(tints.length)
  })
})
