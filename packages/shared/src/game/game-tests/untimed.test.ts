import { describe, expect, it } from "vite-plus/test"
import { ROUND_GRACE, type Game } from "../game.ts"
import { viewIn } from "../view-in.ts"
import { Phase } from "../../protocol/views.ts"
import { mixOf } from "../../protocol/config.ts"
import { QuestionType } from "../../questions.ts"
import { playerName } from "../../ids.ts"
import { T0, viewOf, tokA, tokB, makeGame, paintOn, currentQuestion } from "./support.ts"

describe("an untimed round", () => {
  const untimedGame = (): Game => {
    const game = makeGame({ config: { mix: mixOf({ [QuestionType.PLACE]: 2 }), roundLength: undefined } })
    game.join(tokA, playerName("Alice"), T0)
    game.join(tokB, playerName("Bob"), T0)
    game.start(tokA, T0)
    return game
  }

  it("has no deadline and no wake-up, and does not end on tick however late", () => {
    const game = untimedGame()
    expect(viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round.deadline).toBeUndefined()
    expect(game.nextWakeAt()).toBeUndefined()
    expect(game.tick(T0 + 1_000_000_000 + ROUND_GRACE)).toBe(false)
    expect(game.phase).toBe(Phase.GUESSING)
  })

  it("ends when everyone has locked in, and the next round is untimed too", () => {
    const game = untimedGame()
    const later = T0 + 3_600_000
    game.setPaint(tokA, paintOn(currentQuestion(game, tokA, later)))
    game.lock(tokA, later)
    expect(game.phase).toBe(Phase.GUESSING)
    game.lock(tokB, later + 1)
    expect(game.phase).toBe(Phase.REVEAL)
    game.next(tokA, later + 2)
    expect(game.phase).toBe(Phase.GUESSING)
    expect(viewIn(viewOf(game, tokA, later + 2), Phase.GUESSING).round.deadline).toBeUndefined()
  })

  it("lets the game finish with standings and awards", () => {
    const game = untimedGame()
    for (let round = 0; round < 2; round++) {
      game.lock(tokA, T0 + round)
      game.lock(tokB, T0 + round)
      game.next(tokA, T0 + round)
    }
    expect(viewIn(viewOf(game, tokA, T0), Phase.RESULTS).results).toHaveLength(2)
  })
})
