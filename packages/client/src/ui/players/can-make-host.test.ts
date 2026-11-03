import { describe, expect, it } from "vite-plus/test"
import { playerId } from "@whereabouts/shared/ids"
import { makePlayer } from "../../test-view"
import { canMakeHost } from "./can-make-host"

const you = playerId("p1")

describe("canMakeHost", () => {
  it("allows another connected player who is not the host", () => {
    expect(canMakeHost(you, makePlayer({ id: playerId("p2"), isHost: false }))).toBe(true)
  })

  it("refuses yourself, someone away, and the host", () => {
    expect(canMakeHost(you, makePlayer({ id: you, isHost: false }))).toBe(false)
    expect(canMakeHost(you, makePlayer({ id: playerId("p2"), isHost: false, connected: false }))).toBe(false)
    expect(canMakeHost(you, makePlayer({ id: playerId("p2"), isHost: true }))).toBe(false)
  })
})
