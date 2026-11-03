import { describe, expect, it } from "vite-plus/test"
import type { Game } from "../game.ts"
import { MAX_PLAYERS, MAX_SPECTATORS, SEAT_GRACE } from "../../protocol/config.ts"
import { Phase } from "../../protocol/views.ts"
import { playerId, playerName, type PlayerId } from "../../ids.ts"
import { PLAYER_COLOURS } from "../../colours.ts"
import { CloseReason } from "../../close-reason.ts"
import { Role, YouRoleType } from "../../roles.ts"
import { T0, tok, viewOf, tokA, tokB, tokC, tokD, tokLate, tokNew, tokW1, twoPlayerGame } from "./support.ts"

describe("lobby", () => {
  it("first joiner is host; while the host is away the next player acts as host; a lobby seat left empty is freed", () => {
    const game = twoPlayerGame()
    expect(viewOf(game, tokA, T0).you.isHost).toBe(true)
    expect(viewOf(game, tokB, T0).you.isHost).toBe(false)
    game.disconnect(tokA, T0)
    expect(viewOf(game, tokB, T0).you.isHost).toBe(true)
    expect(game.playerTokens).toEqual([tokA, tokB])
    expect(game.nextWakeAt()).toBe(T0 + SEAT_GRACE)
    expect(game.tick(T0 + SEAT_GRACE - 1)).toBe(false)
    expect(game.tick(T0 + SEAT_GRACE)).toBe(true)
    expect(game.playerTokens).toEqual([tokB])
    expect(game.nextWakeAt()).toBeUndefined()
  })

  it("a refresh in the lobby keeps the seat, colour and host role", () => {
    const game = twoPlayerGame()
    const before = viewOf(game, tokA, T0).players.find((player) => player.name === "Alice")!
    game.disconnect(tokA, T0)
    game.join(tokA, playerName("Alice"), T0 + 2_000)
    const after = viewOf(game, tokA, T0 + 2_000).players.find((player) => player.name === "Alice")!
    expect(after).toMatchObject({ id: before.id, colour: before.colour, connected: true, isHost: true })
    expect(viewOf(game, tokB, T0 + 2_000).you.isHost).toBe(false)
    // Back in time, so nothing is left to free.
    expect(game.nextWakeAt()).toBeUndefined()
    expect(game.tick(T0 + SEAT_GRACE)).toBe(false)
    expect(game.playerTokens).toContain(tokA)
  })

  it("leaving frees the seat at once and passes the host role to the longest-standing online player", () => {
    const game = twoPlayerGame()
    game.join(tokC, playerName("Cara"), T0 + 2)
    game.join(tokD, playerName("Dev"), T0 + 3)
    game.disconnect(tokB, T0 + 4) // Bob is away, so he is passed over
    const cara = viewOf(game, tokC, T0 + 4).you.id
    expect(viewOf(game, tokA, T0 + 4).you.nextHost).toBe(cara)
    expect(viewOf(game, tokC, T0 + 4).you.nextHost).toBeUndefined()
    expect(game.leave(tokA)).toEqual({ ok: true, changed: true })
    expect(game.playerTokens).toEqual([tokB, tokC, tokD])
    expect(viewOf(game, tokC, T0 + 5).you.isHost).toBe(true)
    // Nothing waits on a grace period for Alice.
    expect(game.nextWakeAt()).toBe(T0 + 4 + SEAT_GRACE)
    expect(game.leave(tokA)).toEqual({ ok: false, error: "unknown player" })
  })

  it("the last player leaving empties the game; nobody leaves mid-game", () => {
    const game = twoPlayerGame()
    expect(viewOf(game, tokA, T0).you.nextHost).toBe(viewOf(game, tokB, T0).you.id)
    game.leave(tokB)
    expect(viewOf(game, tokA, T0).you.nextHost).toBeUndefined()
    game.leave(tokA)
    expect(game.playerCount).toBe(0)

    const otherGame = twoPlayerGame()
    otherGame.start(tokA, T0)
    expect(otherGame.leave(tokB)).toEqual({ ok: false, error: "you can only leave from the lobby" })
  })

  it("the host can hand the role to another connected player, for good", () => {
    const game = twoPlayerGame()
    game.join(tokC, playerName("Cara"), T0)
    const id = (name: string): PlayerId => viewOf(game, tokA, T0).players.find((player) => player.name === name)!.id
    expect(game.makeHost(tokB, id("Cara"))).toEqual({ ok: false, error: "only the host can hand over" })
    expect(game.makeHost(tokA, id("Alice"))).toEqual({ ok: false, error: "you are already the host" })
    expect(game.makeHost(tokA, playerId("p99"))).toEqual({ ok: false, error: "unknown player" })
    game.disconnect(tokC, T0)
    expect(game.makeHost(tokA, id("Cara"))).toEqual({ ok: false, error: "that player is offline" })
    expect(game.makeHost(tokA, id("Bob"))).toEqual({ ok: true, changed: true })
    expect(viewOf(game, tokB, T0).you.isHost).toBe(true)
    expect(viewOf(game, tokA, T0).you.isHost).toBe(false)
    // Alice leaving and coming back does not bring the role with her.
    game.disconnect(tokA, T0 + 1)
    game.join(tokA, playerName("Alice"), T0 + 2)
    expect(viewOf(game, tokA, T0 + 2).you.isHost).toBe(false)
  })

  it("an acting host can hand over too, and the absent host does not get it back", () => {
    const game = twoPlayerGame()
    game.join(tokC, playerName("Cara"), T0 + 2)
    game.start(tokA, T0)
    game.disconnect(tokA, T0 + 1)
    const cara = viewOf(game, tokB, T0 + 1).players.find((player) => player.name === "Cara")!
    expect(game.makeHost(tokB, cara.id).ok).toBe(true)
    game.join(tokA, playerName("Alice"), T0 + 5)
    expect(viewOf(game, tokC, T0 + 5).you.isHost).toBe(true)
    expect(viewOf(game, tokA, T0 + 5).you.isHost).toBe(false)
  })

  it("only the host can start", () => {
    const game = twoPlayerGame()
    expect(game.start(tokB, T0)).toEqual({ ok: false, error: "only the host can start" })
    expect(game.start(tokA, T0).ok).toBe(true)
    expect(game.phase).toBe(Phase.GUESSING)
  })
})

describe("player cap", () => {
  const fullGame = (): Game => {
    const game = twoPlayerGame(2)
    for (let i = 3; i <= MAX_PLAYERS; i++) expect(game.join(tok(`${i}`), playerName(`P${i}`), T0).ok).toBe(true)
    return game
  }

  it("has a colour for every player it allows", () => {
    expect(PLAYER_COLOURS.length).toBeGreaterThanOrEqual(MAX_PLAYERS)
  })

  it("seats a newcomer to a full game as a spectator, and turns people away once the spectators are full too", () => {
    const game = fullGame()
    expect(viewOf(game, tokA, T0).players).toHaveLength(MAX_PLAYERS)
    for (let i = 1; i <= MAX_SPECTATORS; i++) expect(game.join(tok(`W${i}`), playerName(`W${i}`), T0).ok).toBe(true)
    const w1 = viewOf(game, tokW1, T0)
    expect(w1.you.role).toEqual({ type: YouRoleType.SPECTATOR })
    expect(w1.spectators.find((player) => player.name === "W1")).toMatchObject({ type: Role.SPECTATOR })
    expect(w1.spectators.find((player) => player.name === "W1")).not.toHaveProperty("colour")
    expect(game.join(tokLate, playerName("Late"), T0)).toEqual({ ok: false, reason: CloseReason.FULL })
  })

  it("still lets a player who dropped out back in", () => {
    const game = fullGame()
    game.disconnect(tokB, T0)
    expect(game.join(tokB, playerName("Bob"), T0).ok).toBe(true)
  })

  it("frees the seat and the colour when the host removes someone", () => {
    const game = fullGame()
    const bob = viewOf(game, tokA, T0).players.find((player) => player.name === "Bob")!
    game.kick(tokA, bob.id, T0)
    expect(game.join(tokNew, playerName("Nine"), T0).ok).toBe(true)
    const nine = viewOf(game, tokA, T0).players.find((player) => player.name === "Nine")!
    expect(nine.colour).toBe(bob.colour)
    const colours = viewOf(game, tokA, T0).players.map((player) => player.colour)
    expect(new Set(colours).size).toBe(MAX_PLAYERS)
  })
})

describe("rename", () => {
  it("changes the visible name for in any phase", () => {
    const game = twoPlayerGame(1)
    expect(game.rename(tokB, playerName("Robert"))).toEqual({ ok: true, changed: true })
    expect(
      viewOf(game, tokA, T0)
        .players.map((player) => player.name)
        .sort()
    ).toEqual(["Alice", "Robert"])
    game.start(tokA, T0)
    expect(game.rename(tokB, playerName("Bobby")).ok).toBe(true)
    expect(game.rename(tokB, playerName("Bobby"))).toEqual({ ok: true, changed: false })
    expect(game.rename(tok("nobody"), playerName("X"))).toEqual({ ok: false, error: "unknown player" })
  })
})

describe("who a view is for", () => {
  it("gives a token with no seat no view: an unknown one, and one that was removed", () => {
    const game = twoPlayerGame()
    expect(game.view(tok("nobody"), T0)).toBeUndefined()
    game.kick(tokA, viewOf(game, tokB, T0).you.id, T0)
    expect(game.view(tokB, T0)).toBeUndefined()
  })

  it("gives a player their own colour with their role, the one the others see", () => {
    const game = twoPlayerGame()
    const bob = viewOf(game, tokB, T0)
    const bobSeenByAlice = viewOf(game, tokA, T0).players.find((player) => player.id === bob.you.id)!
    expect(bob.you.role).toEqual({ type: YouRoleType.PLAYING, colour: bobSeenByAlice.colour })
  })

  it("says a host who watches is a spectator while they still host", () => {
    const game = twoPlayerGame()
    game.setRole(tokA, Role.SPECTATOR)
    const { you } = viewOf(game, tokA, T0)
    expect(you.isHost).toBe(true)
    expect(you.role).toEqual({ type: YouRoleType.SPECTATOR })
  })
})
