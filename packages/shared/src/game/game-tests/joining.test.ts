import { describe, expect, it } from "vite-plus/test"
import { ROUND_GRACE } from "../game.ts"
import { viewIn } from "../view-in.ts"
import { SEAT_GRACE } from "../../protocol/config.ts"
import { Phase } from "../../protocol/views.ts"
import { playerName } from "../../ids.ts"
import { YouRoleType } from "../../roles.ts"
import { T0, viewOf, tokA, tokB, tokC, paintAt, twoPlayerGame, currentQuestion } from "./support.ts"

describe("joining and leaving mid-game", () => {
  it("late joiner spectates the current round and plays the next", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    expect(game.join(tokC, playerName("Cara"), T0 + 5).ok).toBe(true)
    expect(viewOf(game, tokC, T0 + 5).you.role.type).toBe(YouRoleType.JOINED_LATE)
    const question = currentQuestion(game, tokA, T0)
    expect(game.setPaint(tokC, paintAt(question, 0, 0))).toEqual({ ok: false, error: "sitting this round out" })
    game.tick(T0 + 60_000 + ROUND_GRACE)
    expect(
      viewIn(viewOf(game, tokC, T0 + 60_000), Phase.REVEAL).reveal.results.map((result) => result.playerId)
    ).not.toContain("p3")
    game.next(tokA, T0 + 60_001)
    expect(viewOf(game, tokC, T0 + 60_001).you.role.type).toBe(YouRoleType.PLAYING)
    const q2 = currentQuestion(game, tokC, T0 + 60_001)
    expect(game.setPaint(tokC, paintAt(q2, 0, 0)).ok).toBe(true)
  })

  it("a late joiner's total counts the rounds they played", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    game.join(tokC, playerName("Cara"), T0 + 5)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.next(tokA, T0 + 60_001)
    game.tick(T0 + 120_001 + ROUND_GRACE)
    const cara = viewOf(game, tokC, T0 + 120_001).players.find((player) => player.id === "p3")!
    expect(cara.score).toBeGreaterThan(0)
    game.next(tokA, T0 + 120_002)
    const standing = viewIn(viewOf(game, tokC, T0 + 120_002), Phase.RESULTS).results.find(
      (entry) => entry.playerId === "p3"
    )!
    expect(standing.total).toBe(cara.score)
    expect(standing.rounds).toEqual([{}, { score: cara.score }])
  })

  it("a reconnecting player gets their own paint back, and only their own", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    const mine = paintAt(question, 10, 10)
    game.setPaint(tokA, mine)
    game.disconnect(tokA, T0 + 1)
    game.join(tokA, playerName("Alice"), T0 + 5)
    expect(viewIn(viewOf(game, tokA, T0 + 5), Phase.GUESSING).you.paint).toEqual(mine)
    expect(viewIn(viewOf(game, tokB, T0 + 5), Phase.GUESSING).you.paint).toBeUndefined()
    expect(JSON.stringify(viewOf(game, tokB, T0 + 5))).not.toContain(Object.keys(mine.cells)[0])
    game.tick(T0 + 60_000 + ROUND_GRACE)
    expect(viewOf(game, tokA, T0 + 60_000).you).not.toHaveProperty("paint")
  })

  it("a disconnected player keeps their seat and score, and reclaims it by token", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.disconnect(tokB, T0 + 60_001)
    expect(game.playerTokens).toContain(tokB)
    expect(viewOf(game, tokA, T0 + 60_001).players.find((player) => player.id === "p2")!.connected).toBe(false)
    game.join(tokB, playerName("Bob"), T0 + 70_000)
    const bob = viewOf(game, tokB, T0 + 70_000).players.find((player) => player.id === "p2")!
    expect(bob.connected).toBe(true)
    expect(bob.score).toBeGreaterThan(0)
  })

  it("while the host is away the longest-standing player acts as host; the host regains it on return", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    game.disconnect(tokA, T0 + 1)
    expect(viewOf(game, tokB, T0 + 1).you.isHost).toBe(true)
    expect(viewOf(game, tokB, T0 + 1).players.find((player) => player.id === "p2")!.isHost).toBe(true)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    expect(game.next(tokA, T0 + 60_000)).toEqual({ ok: false, error: "only the host can advance" })
    expect(game.next(tokB, T0 + 60_000).ok).toBe(true)
    // A refresh brings the original host straight back.
    game.join(tokA, playerName("Alice"), T0 + 61_000)
    expect(viewOf(game, tokA, T0 + 61_000).you.isHost).toBe(true)
    expect(viewOf(game, tokB, T0 + 61_000).you.isHost).toBe(false)
  })

  it("in the lobby a host gone longer than the grace period hands over for good", () => {
    const game = twoPlayerGame(2)
    game.disconnect(tokA, T0 + 1)
    game.tick(T0 + 1 + SEAT_GRACE)
    game.join(tokA, playerName("Alice"), T0 + 1 + SEAT_GRACE + 5)
    expect(viewOf(game, tokA, T0 + SEAT_GRACE + 6).you.isHost).toBe(false)
    expect(viewOf(game, tokB, T0 + SEAT_GRACE + 6).you.isHost).toBe(true)
  })
})
