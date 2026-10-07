// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/preact"
import type { GameView } from "@whereabouts/shared"
import type { Connection } from "./net"
import { hostSetup } from "./settings"
import { configureAsHost, savedSetupPatch, useSavedSetup } from "./host-setup"

const MIX = { landmarks: 3, places: 3, countries: 2, flags: 2 }
const SAVED = { mix: MIX, roundMs: 90_000, mapDetail: "political" }

function lobby(isHost: boolean, phase: GameView["phase"] = "lobby"): GameView {
  return { phase, you: { isHost } } as GameView
}

function Harness({ conn, view, created }: { conn: Connection; view: GameView | null; created: boolean }) {
  useSavedSetup(conn, view, created)
  return null
}

afterEach(() => {
  hostSetup.value = {}
})

describe("savedSetupPatch", () => {
  it("passes through a setup the game still offers", () => {
    expect(savedSetupPatch(SAVED)).toEqual(SAVED)
  })

  it("drops only the settings the game no longer offers, so the rest still apply", () => {
    expect(savedSetupPatch({ ...SAVED, roundMs: 75_000, mix: { ...MIX, flags: 9 } })).toEqual({
      mapDetail: "political"
    })
  })

  it("turns a setup saved before the question mix into one", () => {
    const old = (setup: object) => savedSetupPatch({ roundMs: 90_000, ...setup }).mix
    expect(old({ rounds: 12, photoShare: 0 })).toEqual({ landmarks: 0, places: 12, countries: 0, flags: 0 })
    expect(old({ rounds: 8, photoShare: 0.75, countries: "mixed" })).toEqual({
      landmarks: 5,
      places: 1,
      countries: 2,
      flags: 0
    })
    expect(old({ rounds: 8, countries: "only", flags: "only" })).toEqual({
      landmarks: 0,
      places: 0,
      countries: 4,
      flags: 4
    })
    expect(old({ flags: "mixed" })).toEqual({ landmarks: 3, places: 3, countries: 0, flags: 2 })
    expect(savedSetupPatch({ roundMs: 90_000 })).toEqual({ roundMs: 90_000 })
  })

  it("ignores unknown keys and anything that is not a saved setup", () => {
    expect(savedSetupPatch({ roundMs: 30_000, kernelId: "single", colour: "red" })).toEqual({ roundMs: 30_000 })
    for (const junk of [null, undefined, "rounds", 7, []]) expect(savedSetupPatch(junk)).toEqual({})
  })
})

describe("configureAsHost", () => {
  it("sends the change and remembers it alongside the earlier ones", () => {
    const configure = vi.fn()
    const conn = { configure } as unknown as Connection
    configureAsHost(conn, { mix: MIX })
    configureAsHost(conn, { mapDetail: "water" })
    expect(configure).toHaveBeenLastCalledWith({ mapDetail: "water" })
    expect(hostSetup.value).toEqual({ mix: MIX, mapDetail: "water" })
  })
})

describe("useSavedSetup", () => {
  it("gives a game this tab just created the remembered setup, once", () => {
    hostSetup.value = SAVED
    const configure = vi.fn()
    const conn = { configure } as unknown as Connection
    const { rerender } = render(<Harness conn={conn} view={null} created />)
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
    render(<Harness conn={conn} view={lobby(true, "guessing")} created />)
    expect(configure).not.toHaveBeenCalled()
  })

  it("sends nothing when there is no remembered setup", () => {
    const configure = vi.fn()
    render(<Harness conn={{ configure } as unknown as Connection} view={lobby(true)} created />)
    expect(configure).not.toHaveBeenCalled()
  })
})
