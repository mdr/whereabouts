// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { render } from "@testing-library/preact"
import { mixOf, type GameView, Phase, MapDetail } from "@whereabouts/shared/protocol"
import { QuestionType } from "@whereabouts/shared/questions"
import type { Connection } from "./net"
import { hostSetup } from "./settings"
import { configureAsHost, savedSetupPatch, useSavedSetup } from "./host-setup"

const { LANDMARK, PLACE, COUNTRY, FLAG } = QuestionType
const MIX = mixOf({ [LANDMARK]: 3, [PLACE]: 3, [COUNTRY]: 2, [FLAG]: 2 })
const SAVED = { mix: MIX, roundMs: 90_000, mapDetail: MapDetail.POLITICAL }

function lobby(isHost: boolean, phase: GameView["phase"] = Phase.LOBBY): GameView {
  return { phase, you: { isHost } } as GameView
}

function Harness({ conn, view, created }: { conn: Connection; view: GameView | undefined; created: boolean }) {
  useSavedSetup(conn, view, created)
  return undefined
}

afterEach(() => {
  hostSetup.value = {}
})

describe("savedSetupPatch", () => {
  it("passes through a setup the game still offers", () => {
    expect(savedSetupPatch(SAVED)).toEqual(SAVED)
  })

  it("drops only the settings the game no longer offers, so the rest still apply", () => {
    expect(savedSetupPatch({ ...SAVED, roundMs: 75_000, mix: { ...MIX, [FLAG]: 9 } })).toEqual({
      mapDetail: MapDetail.POLITICAL
    })
  })

  it("turns a setup saved before the question mix into one", () => {
    const old = (setup: object) => savedSetupPatch({ roundMs: 90_000, ...setup }).mix
    expect(old({ rounds: 12, photoShare: 0 })).toEqual(mixOf({ [PLACE]: 12 }))
    expect(old({ rounds: 8, photoShare: 0.75, countries: "mixed" })).toEqual(
      mixOf({ [LANDMARK]: 5, [PLACE]: 1, [COUNTRY]: 2 })
    )
    expect(old({ rounds: 8, countries: "only", flags: "only" })).toEqual(mixOf({ [COUNTRY]: 4, [FLAG]: 4 }))
    expect(old({ flags: "mixed" })).toEqual(mixOf({ [LANDMARK]: 3, [PLACE]: 3, [FLAG]: 2 }))
    expect(savedSetupPatch({ roundMs: 90_000 })).toEqual({ roundMs: 90_000 })
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
    expect(savedSetupPatch({ roundMs: 30_000, kernelId: "single", colour: "red" })).toEqual({ roundMs: 30_000 })
    for (const junk of [JSON.parse("null"), undefined, "rounds", 7, []]) expect(savedSetupPatch(junk)).toEqual({})
  })
})

describe("configureAsHost", () => {
  it("sends the change and remembers it alongside the earlier ones", () => {
    const configure = vi.fn()
    const conn = { configure } as unknown as Connection
    configureAsHost(conn, { mix: MIX })
    configureAsHost(conn, { mapDetail: MapDetail.WATER })
    expect(configure).toHaveBeenLastCalledWith({ mapDetail: MapDetail.WATER })
    expect(hostSetup.value).toEqual({ mix: MIX, mapDetail: MapDetail.WATER })
  })
})

describe("useSavedSetup", () => {
  it("gives a game this tab just created the remembered setup, once", () => {
    hostSetup.value = SAVED
    const configure = vi.fn()
    const conn = { configure } as unknown as Connection
    const { rerender } = render(<Harness conn={conn} view={undefined} created />)
    expect(configure).not.toHaveBeenCalled()
    rerender(<Harness conn={conn} view={lobby(true)} created />)
    rerender(<Harness conn={conn} view={{ ...lobby(true) }} created />)
    expect(configure).toHaveBeenCalledTimes(1)
    expect(configure).toHaveBeenCalledWith(SAVED)
  })

  it("leaves joined games, refreshed lobbies and games under way alone", () => {
    hostSetup.value = SAVED
    const configure = vi.fn()
    const conn = { configure } as unknown as Connection
    render(<Harness conn={conn} view={lobby(true)} created={false} />)
    render(<Harness conn={conn} view={lobby(false)} created />)
    render(<Harness conn={conn} view={lobby(true, Phase.GUESSING)} created />)
    expect(configure).not.toHaveBeenCalled()
  })

  it("sends nothing when there is no remembered setup", () => {
    const configure = vi.fn()
    render(<Harness conn={{ configure } as unknown as Connection} view={lobby(true)} created />)
    expect(configure).not.toHaveBeenCalled()
  })
})
