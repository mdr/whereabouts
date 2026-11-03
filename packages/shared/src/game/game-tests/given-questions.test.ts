import { describe, expect, it } from "vite-plus/test"
import { viewIn } from "../view-in.ts"
import { Phase } from "../../protocol/views.ts"
import { promptOf, type Question } from "../../questions.ts"
import { playerName } from "../../ids.ts"
import { T0, viewOf, tokA, makeGame, pool } from "./support.ts"

describe("given questions", () => {
  const promptsPlayed = (questions: readonly Question[]): string[] => {
    const game = makeGame({ questions })
    game.join(tokA, playerName("Alice"), T0)
    game.start(tokA, T0)
    const prompts: string[] = []
    while (game.phase === Phase.GUESSING) {
      const { round } = viewIn(viewOf(game, tokA, T0), Phase.GUESSING)
      expect(round.total).toBe(questions.length)
      prompts.push(promptOf(round.question))
      game.lock(tokA, T0)
      game.next(tokA, T0)
    }
    expect(game.phase).toBe(Phase.RESULTS)
    return prompts
  }

  it("are played in the order given, and the game ends after the last", () => {
    const order = [pool[2]!, pool[0]!, pool[1]!]
    expect(promptsPlayed(order)).toEqual(order.map(promptOf))
  })

  it("can outnumber a hosted game's rounds", () => {
    const many = Array.from({ length: 40 }, (_, i) => pool[i % pool.length]!)
    expect(promptsPlayed(many)).toHaveLength(40)
  })

  it("are kept when the game is played again", () => {
    const game = makeGame({ questions: [pool[1]!] })
    game.join(tokA, playerName("Alice"), T0)
    game.start(tokA, T0)
    game.lock(tokA, T0)
    game.next(tokA, T0)
    game.again(tokA, T0)
    game.start(tokA, T0)
    expect(promptOf(viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round.question)).toBe(promptOf(pool[1]!))
  })
})
