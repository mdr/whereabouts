// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { signal } from "@preact/signals"
import { mixOf, MapDetail } from "@whereabouts/shared/protocol/config"
import { type GameView, Phase } from "@whereabouts/shared/protocol/views"
import { QuestionType } from "@whereabouts/shared/questions"
import { hostSetup } from "./settings"
import { configureAsHost, savedSetupPatch, shouldApplySavedSetup } from "./host-setup"

const { LANDMARK, PLACE, COUNTRY, FLAG } = QuestionType
const MIX = mixOf({ [LANDMARK]: 3, [PLACE]: 3, [COUNTRY]: 2, [FLAG]: 2 })
const SAVED = { mix: MIX, roundLength: 90_000, mapDetail: MapDetail.POLITICAL }

afterEach(() => {
  hostSetup.value = {}
})

describe("savedSetupPatch", () => {
  it("passes through a setup the game still offers", () => {
    expect(savedSetupPatch(SAVED)).toEqual(SAVED)
  })

  it("drops only the settings the game no longer offers, so the rest still apply", () => {
    expect(savedSetupPatch({ ...SAVED, roundLength: 75_000, mix: { ...MIX, [FLAG]: 9 } })).toEqual({
      mapDetail: MapDetail.POLITICAL
    })
  })

  it("turns a setup saved before the question mix into one", () => {
    const old = (setup: object): unknown => savedSetupPatch({ roundLength: 90_000, ...setup }).mix
    expect(old({ rounds: 12, photoShare: 0 })).toEqual(mixOf({ [PLACE]: 12 }))
    expect(old({ rounds: 8, photoShare: 0.75, countries: "mixed" })).toEqual(
      mixOf({ [LANDMARK]: 5, [PLACE]: 1, [COUNTRY]: 2 })
    )
    expect(old({ rounds: 8, countries: "only", flags: "only" })).toEqual(mixOf({ [COUNTRY]: 4, [FLAG]: 4 }))
    expect(old({ flags: "mixed" })).toEqual(mixOf({ [LANDMARK]: 3, [PLACE]: 3, [FLAG]: 2 }))
    expect(savedSetupPatch({ roundLength: 90_000 })).toEqual({ roundLength: 90_000 })
  })

  it("renames a mix saved under the old names of the question types", () => {
    expect(
      savedSetupPatch({ mix: { landmarks: 3, places: 3, countries: 2, flags: 2, features: 0, states: 0 } })
    ).toEqual({ mix: MIX })
  })

  it("reads a map detail saved in lower case", () => {
    expect(savedSetupPatch({ mapDetail: "political" })).toEqual({ mapDetail: MapDetail.POLITICAL })
  })

  it("keeps a mix saved before islands, lakes, seas and US states, with none of them", () => {
    expect(savedSetupPatch({ mix: { landmarks: 3, places: 3, countries: 2, flags: 2 } }).mix).toEqual(MIX)
  })

  it("ignores unknown keys and anything that is not a saved setup", () => {
    expect(savedSetupPatch({ roundLength: 30_000, kernelId: "single", colour: "red" })).toEqual({ roundLength: 30_000 })
    for (const junk of [JSON.parse("null"), undefined, "rounds", 7, []]) expect(savedSetupPatch(junk)).toEqual({})
  })
})

describe("configureAsHost", () => {
  it("sends the change and remembers it alongside the earlier ones", () => {
    const configure = vi.fn()
    const game = { configure, online: signal(true) }
    configureAsHost(game, { mix: MIX })
    configureAsHost(game, { mapDetail: MapDetail.WATER })
    expect(configure).toHaveBeenLastCalledWith({ mapDetail: MapDetail.WATER })
    expect(hostSetup.value).toEqual({ mix: MIX, mapDetail: MapDetail.WATER })
  })

  it("neither sends nor remembers a change while reconnecting", () => {
    const configure = vi.fn()
    configureAsHost({ configure, online: signal(false) }, { mix: MIX })
    expect(configure).not.toHaveBeenCalled()
    expect(hostSetup.value).toEqual({})
  })
})

describe("shouldApplySavedSetup", () => {
  const lobby = (isHost: boolean, phase: Phase = Phase.LOBBY): GameView => ({ phase, you: { isHost } }) as GameView

  it("is for a game this tab just created, once it reaches its lobby", () => {
    expect(shouldApplySavedSetup(true, undefined)).toBe(false)
    expect(shouldApplySavedSetup(true, lobby(true))).toBe(true)
  })

  it("leaves joined games, guests' lobbies and games under way alone", () => {
    expect(shouldApplySavedSetup(false, lobby(true))).toBe(false)
    expect(shouldApplySavedSetup(true, lobby(false))).toBe(false)
    expect(shouldApplySavedSetup(true, lobby(true, Phase.GUESSING))).toBe(false)
  })
})
