import { describe, expect, it } from "vite-plus/test"
import { ROUND_GRACE } from "../game.ts"
import { viewIn } from "../view-in.ts"
import { QuestionType } from "../../questions.ts"
import { mixOf } from "../../protocol/config.ts"
import { Phase } from "../../protocol/views.ts"
import { playerName } from "../../ids.ts"
import { YouRoleType } from "../../roles.ts"
import { T0, viewOf, tokA, tokB, paintOn, makeGame, twoPlayerGame, currentQuestion } from "./support.ts"

describe("the reveal", () => {
  function atFirstReveal() {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    return game
  }

  it("has no deadline of its own", () => {
    expect(atFirstReveal().nextWakeAt()).toBeUndefined()
  })

  it("cannot be advanced by a player who is not the host", () => {
    const game = atFirstReveal()
    expect(game.next(tokB, T0 + 61_000)).toEqual({ ok: false, error: "only the host can advance" })
  })

  it("shows who is ready, and readying twice changes nothing", () => {
    const game = atFirstReveal()
    expect(game.ready(tokB, T0 + 61_000)).toEqual({ ok: true, changed: true })
    expect(game.ready(tokB, T0 + 61_000)).toEqual({ ok: true, changed: false })
    expect(game.phase).toBe(Phase.REVEAL)
    expect(viewIn(viewOf(game, tokA, T0 + 61_000), Phase.REVEAL).reveal.ready).toEqual(["p2"])
  })

  it("advances to the next round when everyone is ready", () => {
    const game = atFirstReveal()
    game.ready(tokB, T0 + 61_000)
    expect(game.ready(tokA, T0 + 62_000).ok).toBe(true)
    expect(game.phase).toBe(Phase.GUESSING)
    expect(viewIn(viewOf(game, tokA, T0 + 62_000), Phase.GUESSING).round.index).toBe(1)
    expect(game.nextWakeAt()).toBe(T0 + 122_000 + ROUND_GRACE)
  })

  it("starts the next round's reveal with nobody ready", () => {
    const game = atFirstReveal()
    game.ready(tokB, T0 + 61_000)
    game.ready(tokA, T0 + 62_000)
    game.tick(T0 + 122_000 + ROUND_GRACE)
    expect(game.phase).toBe(Phase.REVEAL)
    expect(viewIn(viewOf(game, tokA, T0 + 122_000), Phase.REVEAL).reveal.ready).toEqual([])
  })

  it("lets the host advance without waiting for the others; after the last round that ends in results", () => {
    const game = atFirstReveal()
    game.next(tokA, T0 + 62_000)
    game.tick(T0 + 122_000 + ROUND_GRACE)
    expect(game.ready(tokA, T0 + 123_000)).toEqual({ ok: true, changed: true })
    expect(game.next(tokA, T0 + 124_000).ok).toBe(true)
    expect(game.phase).toBe(Phase.RESULTS)
    const results = viewIn(viewOf(game, tokA, T0 + 124_000), Phase.RESULTS).results
    expect(results).toHaveLength(2)
    expect(results[0]!.total).toBeGreaterThanOrEqual(results[1]!.total)
    expect(results[0]!.rounds).toHaveLength(2)
  })
})

describe("ready-up edge cases", () => {
  it("a player leaving during the reveal does not hold the others up", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.ready(tokA, T0 + 61_000)
    expect(game.phase).toBe(Phase.REVEAL)
    game.disconnect(tokB, T0 + 62_000)
    expect(game.phase).toBe(Phase.GUESSING)
  })

  it("nobody left connected means nothing advances", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.disconnect(tokA, T0 + 61_000)
    game.disconnect(tokB, T0 + 61_001)
    expect(game.phase).toBe(Phase.REVEAL)
  })

  it("ready is only meaningful during the reveal, and resets each round", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    expect(game.ready(tokA, T0)).toEqual({ ok: true, changed: false })
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.ready(tokA, T0 + 61_000)
    game.ready(tokB, T0 + 61_000)
    game.tick(T0 + 121_000 + ROUND_GRACE)
    expect(viewIn(viewOf(game, tokA, T0 + 121_000), Phase.REVEAL).reveal.ready).toEqual([])
  })
})

describe("what each phase holds", () => {
  it("the reveal stays the same object while it shows, and goes when the next round starts", () => {
    const game = twoPlayerGame()
    game.start(tokA, T0)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const reveal = game.roundReveal
    expect(reveal).toBeDefined()
    game.ready(tokA, T0 + 62_000)
    expect(game.roundReveal).toBe(reveal)
    game.ready(tokB, T0 + 62_000)
    expect(game.roundReveal).toBeUndefined()
  })

  it("who locked in still shows at the reveal, and clears when the next round starts", () => {
    const game = twoPlayerGame()
    game.start(tokA, T0)
    game.lock(tokA, T0 + 1_000)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    expect(viewOf(game, tokA, T0 + 62_000).you.role).toMatchObject({ type: YouRoleType.PLAYING, locked: true })
    expect(viewOf(game, tokB, T0 + 62_000).you.role).toMatchObject({ type: YouRoleType.PLAYING, locked: false })
    game.next(tokA, T0 + 62_000)
    expect(viewOf(game, tokA, T0 + 62_000).you.role).toMatchObject({ type: YouRoleType.PLAYING, locked: false })
  })

  it("a player's own paint is theirs to restore while guessing, and gone once the round ends", () => {
    const game = twoPlayerGame()
    game.start(tokA, T0)
    const paint = paintOn(currentQuestion(game, tokA, T0))
    game.setPaint(tokA, paint)
    expect(game.paintOf(tokA)).toEqual(paint)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    expect(game.paintOf(tokA)).toBeUndefined()
  })

  it("refuses to start a game with no rounds to play", () => {
    const game = makeGame({ config: { mix: mixOf({ [QuestionType.FLAG]: 1 }) } })
    game.join(tokA, playerName("Alice"), T0)
    expect(game.start(tokA, T0)).toEqual({ ok: false, error: "no rounds to play" })
    expect(game.phase).toBe(Phase.LOBBY)
  })
})
