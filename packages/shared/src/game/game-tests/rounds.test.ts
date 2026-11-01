import { describe, expect, it } from "vite-plus/test"
import { ROUND_GRACE } from "../game.ts"
import { viewIn } from "../view-in.ts"
import { PASS_SCORE } from "../../scoring/scoring.ts"
import { Phase, RoundGuessType } from "../../protocol/views.ts"
import { playerName } from "../../ids.ts"
import { YouRoleType } from "../../roles.ts"
import { T0, viewOf, tokA, tokB, tokC, paintAt, paintOn, twoPlayerGame, currentQuestion } from "./support.ts"

describe("round loop", () => {
  describe("at the deadline", () => {
    function revealedAfterDeadline() {
      const game = twoPlayerGame(1)
      game.start(tokA, T0)
      const question = currentQuestion(game, tokA, T0)
      // Alice paints on the answer; Bob paints nothing.
      expect(game.setPaint(tokA, paintOn(question))).toEqual({ ok: true, changed: false })
      game.tick(T0 + 60_000 + ROUND_GRACE)
      return { game, question, reveal: viewIn(viewOf(game, tokB, T0 + 60_000), Phase.REVEAL).reveal }
    }

    it("the round runs for its length, then a grace, and then goes to the reveal", () => {
      const game = twoPlayerGame(1)
      game.start(tokA, T0)
      expect(viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round.deadline).toBe(T0 + 60_000)
      expect(game.tick(T0 + 60_000 + ROUND_GRACE - 1)).toBe(false)
      expect(game.tick(T0 + 60_000 + ROUND_GRACE)).toBe(true)
      expect(game.phase).toBe(Phase.REVEAL)
      expect(game.nextWakeAt()).toBeUndefined()
    })

    it("an exact hit scores high and is listed first", () => {
      const { reveal } = revealedAfterDeadline()
      const [first] = reveal.results
      expect(first!.playerId).toBe("p1")
      expect(first!.score).toBeGreaterThan(900)
    })

    it("a blank guess scores as a pass", () => {
      const { reveal } = revealedAfterDeadline()
      const second = reveal.results[1]
      expect(second!.guess.type).toBe(RoundGuessType.PASSED)
      expect(second!.score).toBe(PASS_SCORE.score)
    })

    it("the reveal names the answer and lists every player, none yet ready", () => {
      const { question, reveal } = revealedAfterDeadline()
      expect(reveal.label).toBe(question.label)
      expect(reveal.wiki).toBe(question.wiki)
      expect(reveal.results).toHaveLength(2)
      expect(reveal.ready).toEqual([])
    })
  })

  it("paint is private during guessing and visible after the reveal", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintAt(question, 10, 10))
    const during = viewOf(game, tokB, T0 + 10)
    expect(during).not.toHaveProperty("reveal")
    expect(JSON.stringify(during)).not.toContain("cells")
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const after = viewIn(viewOf(game, tokB, T0 + 60_000), Phase.REVEAL)
    expect(after.reveal.results.find((result) => result.playerId === "p1")!.guess.type).toBe(RoundGuessType.PAINTED)
  })

  it("locking freezes paint; late paint is rejected", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintAt(question, 0, 0))
    expect(game.lock(tokA, T0)).toEqual({ ok: true, changed: true })
    expect(viewOf(game, tokA, T0).you.role).toMatchObject({ type: YouRoleType.PLAYING, locked: true })
    expect(game.setPaint(tokA, paintAt(question, 1, 1))).toEqual({ ok: true, changed: false }) // stale upload, ignored
  })

  it("unlocking after Done lets the guess change, only while the round runs", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    expect(game.unlock(tokA)).toEqual({ ok: true, changed: false }) // not locked: nothing to undo
    game.setPaint(tokA, paintAt(question, 0, 0))
    game.lock(tokA, T0)
    expect(game.unlock(tokA)).toEqual({ ok: true, changed: true })
    expect(viewOf(game, tokA, T0).you.role).toMatchObject({ type: YouRoleType.PLAYING, locked: false })
    // The new guess replaces the old one and is what gets scored.
    game.setPaint(tokA, paintOn(question))
    game.lock(tokA, T0 + 1)
    game.setPaint(tokB, paintAt(question, 0, 0))
    game.lock(tokB, T0 + 2) // everyone done: the round ends
    expect(game.phase).toBe(Phase.REVEAL)
    const mine = viewIn(viewOf(game, tokA, T0 + 2), Phase.REVEAL).reveal.results.find(
      (result) => result.playerId === "p1"
    )!
    expect(mine.score).toBeGreaterThan(900)
    expect(game.unlock(tokA)).toEqual({ ok: true, changed: false }) // too late: ignored
    expect(game.lock(tokA, T0 + 3)).toEqual({ ok: true, changed: false })
  })

  it("locking with nothing painted is a pass: the pass score, no paint, and the round can end early", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    expect(game.lock(tokA, T0)).toEqual({ ok: true, changed: true })
    expect(viewOf(game, tokA, T0).you.role).toMatchObject({ type: YouRoleType.PLAYING, locked: true })
    // Paint arriving after a pass is a stale upload and changes nothing.
    expect(game.setPaint(tokA, paintAt(question, 0, 0))).toEqual({ ok: true, changed: false })
    game.setPaint(tokB, paintAt(question, 0, 0))
    game.lock(tokB, T0 + 5)
    expect(game.phase).toBe(Phase.REVEAL)
    const mine = viewIn(viewOf(game, tokA, T0 + 5), Phase.REVEAL).reveal.results.find(
      (result) => result.playerId === "p1"
    )!
    expect(mine.guess.type).toBe(RoundGuessType.PASSED)
    expect(mine.score).toBe(250)
  })

  it("the round ends as soon as every active connected player has locked in", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    game.join(tokC, playerName("Cara"), T0 + 5) // sitting this round out: must not hold it up
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintAt(question, 0, 0))
    game.setPaint(tokB, paintAt(question, 1, 1))
    game.lock(tokA, T0 + 10)
    expect(game.phase).toBe(Phase.GUESSING)
    game.lock(tokB, T0 + 20)
    expect(game.phase).toBe(Phase.REVEAL)
    expect(viewIn(viewOf(game, tokA, T0 + 20), Phase.REVEAL).reveal.results).toHaveLength(2)
  })

  it("a dropped player does not hold up a round the others have locked", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintAt(question, 0, 0))
    game.lock(tokA, T0 + 10)
    expect(game.phase).toBe(Phase.GUESSING)
    game.disconnect(tokB, T0 + 20)
    expect(game.phase).toBe(Phase.REVEAL)
    // Bob still gets scored (blank) and keeps his seat.
    expect(viewIn(viewOf(game, tokA, T0 + 20), Phase.REVEAL).reveal.results).toHaveLength(2)
    expect(game.playerTokens).toContain(tokB)
  })

  it("paint arriving just after the deadline still counts, and an empty upload takes paint back", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    // Alice painted, then erased it all: the empty upload replaces her paint.
    game.setPaint(tokA, paintOn(question))
    game.setPaint(tokA, { cells: {}, floor: 0.05 })
    // Bob's last stroke, sent at zero, lands within the grace period.
    expect(game.tick(T0 + 60_000)).toBe(false)
    game.setPaint(tokB, paintOn(question))
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const results = viewIn(viewOf(game, tokA, T0 + 61_000), Phase.REVEAL).reveal.results
    const alice = results.find((result) => result.playerId === "p1")!
    expect(alice.score).toBe(PASS_SCORE.score)
    expect(alice.guess.type).toBe(RoundGuessType.PASSED)
    expect(results.find((result) => result.playerId === "p2")!.score).toBeGreaterThan(900)
  })
})
