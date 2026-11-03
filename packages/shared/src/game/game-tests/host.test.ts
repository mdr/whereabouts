import { describe, expect, it } from "vite-plus/test"
import { viewIn } from "../view-in.ts"
import { Phase } from "../../protocol/views.ts"
import { playerId, playerName, type PlayerId } from "../../ids.ts"
import { CloseReason } from "../../close-reason.ts"
import { T0, viewOf, tokA, tokB, tokC, paintAt, paintOn, twoPlayerGame, currentQuestion } from "./support.ts"
import type { Game } from "../game.ts"
import type { PlaceQuestion } from "../../questions.ts"

describe("host removes a player", () => {
  describe("removing a player", () => {
    const inRound = (): { game: Game; question: PlaceQuestion; aliceId: PlayerId; bobId: PlayerId } => {
      const game = twoPlayerGame()
      game.start(tokA, T0)
      const question = currentQuestion(game, tokA, T0)
      game.setPaint(tokB, paintOn(question))
      return { game, question, aliceId: viewOf(game, tokA, T0).you.id, bobId: viewOf(game, tokB, T0).you.id }
    }

    it("is refused for a non-host, for yourself and for someone unknown", () => {
      const { game, aliceId } = inRound()
      expect(game.kick(tokB, aliceId, T0)).toEqual({ ok: false, error: "only the host can remove players" })
      expect(game.kick(tokA, aliceId, T0)).toEqual({ ok: false, error: "you cannot remove yourself" })
      expect(game.kick(tokA, playerId("p99"), T0)).toEqual({ ok: false, error: "unknown player" })
    })

    it("drops their seat, bans the token, and lets a fresh token in", () => {
      const { game, bobId } = inRound()
      expect(game.kick(tokA, bobId, T0).ok).toBe(true)
      expect(game.playerTokens).toEqual([tokA])
      expect(game.join(tokB, playerName("Bob again"), T0)).toEqual({ ok: false, reason: CloseReason.REMOVED })
      expect(game.join(tokC, playerName("Carol"), T0).ok).toBe(true)
    })

    it("drops their paint: it does not surface when the round ends", () => {
      const { game, question, bobId } = inRound()
      game.kick(tokA, bobId, T0)
      game.join(tokC, playerName("Carol"), T0)
      game.setPaint(tokA, paintAt(question, 0, 0))
      game.lock(tokA, T0)
      expect(game.phase).toBe(Phase.REVEAL)
      expect(
        viewIn(viewOf(game, tokA, T0), Phase.REVEAL).reveal.results.map((result) => result.playerId)
      ).not.toContain(bobId)
    })
  })

  it("removing the last unlocked player ends the round", () => {
    const game = twoPlayerGame()
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintAt(question, 0, 0))
    game.lock(tokA, T0)
    expect(game.phase).toBe(Phase.GUESSING)
    game.kick(tokA, viewOf(game, tokB, T0).you.id, T0)
    expect(game.phase).toBe(Phase.REVEAL)
  })

  it("is refused on the final results, which keep every finalist", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    game.lock(tokA, T0)
    game.lock(tokB, T0)
    game.next(tokA, T0)
    expect(game.phase).toBe(Phase.RESULTS)
    expect(game.kick(tokA, viewOf(game, tokB, T0).you.id, T0)).toEqual({ ok: false, error: "game has finished" })
    expect(game.playerTokens).toEqual([tokA, tokB])
  })

  it("removing an absent host passes the role", () => {
    const otherGame = twoPlayerGame()
    otherGame.start(tokA, T0)
    otherGame.disconnect(tokA, T0)
    // Bob acts as host while Alice is away, and may remove her for good.
    const alice = viewOf(otherGame, tokB, T0).players.find((player) => !player.connected)!
    expect(otherGame.kick(tokB, alice.id, T0).ok).toBe(true)
    expect(otherGame.playerTokens).toEqual([tokB])
    expect(viewOf(otherGame, tokB, T0).you.isHost).toBe(true)
    // Alice reconnecting does not get her seat or the role back.
    expect(otherGame.join(tokA, playerName("Alice"), T0).ok).toBe(false)
  })
})

describe("host ends the game early", () => {
  it("scores the running round and jumps to results; only the host; nothing to end in the lobby", () => {
    const game = twoPlayerGame(3)
    expect(game.end(tokA)).toEqual({ ok: false, error: "nothing to end" })
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintOn(question))
    expect(game.end(tokB)).toEqual({ ok: false, error: "only the host can end the game" })
    expect(game.end(tokA).ok).toBe(true)
    expect(game.phase).toBe(Phase.RESULTS)
    const results = viewIn(viewOf(game, tokA, T0), Phase.RESULTS).results
    expect(results[0]!.rounds).toHaveLength(1)
    expect(results[0]!.total).toBeGreaterThan(500)
  })

  it("works from the reveal too", () => {
    const game = twoPlayerGame(3)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintAt(question, 0, 0))
    game.setPaint(tokB, paintAt(question, 0, 0))
    game.lock(tokA, T0)
    game.lock(tokB, T0)
    expect(game.phase).toBe(Phase.REVEAL)
    expect(game.end(tokA).ok).toBe(true)
    expect(game.phase).toBe(Phase.RESULTS)
  })
})
