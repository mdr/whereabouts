import { describe, expect, it } from "vite-plus/test"
import { ROUND_GRACE } from "../game.ts"
import { viewIn } from "../view-in.ts"
import { Phase } from "../../protocol/views.ts"
import { playerId } from "../../ids.ts"
import { petra, T0, viewOf, tokA, tokB, paintAt, paintOn, twoPlayerGame, currentQuestion } from "./support.ts"

describe("awards", () => {
  const atResults = () => {
    const game = twoPlayerGame(3)
    game.start(tokA, T0)
    let now = T0
    for (let i = 0; i < 3; i++) {
      // Alice passes straight away; Bob paints one confident dab in the Gulf of Guinea.
      game.lock(tokA, now + 1_000)
      game.setPaint(tokB, paintAt(petra, 0, 0))
      game.lock(tokB, now + 2_000)
      now += 3_000
      game.next(tokA, now)
    }
    return { game, now }
  }

  it("are handed out at the end", () => {
    const { game, now } = atResults()
    expect(game.phase).toBe(Phase.RESULTS)
    const awards = viewIn(viewOf(game, tokA, now), Phase.RESULTS).awards
    expect(awards.length).toBeGreaterThanOrEqual(2)
    expect(awards.find((award) => award.title === "Chicken")?.playerIds).toEqual(["p1"])
    expect(awards.some((award) => award.playerIds.includes(playerId("p2")))).toBe(true)
  })

  it("are cleared for the next game", () => {
    const { game, now } = atResults()
    game.again(tokA, now)
    expect(viewOf(game, tokA, now)).not.toHaveProperty("awards")
  })
})

describe("final standings", () => {
  it("carry each player's name and colour as at the finish", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    game.lock(tokA, T0)
    game.lock(tokB, T0)
    game.next(tokA, T0)
    const view = viewIn(viewOf(game, tokA, T0), Phase.RESULTS)
    expect(view.results.map(({ playerId, name, colour }) => ({ playerId, name, colour }))).toEqual(
      expect.arrayContaining(
        view.players.map((player) => ({ playerId: player.id, name: player.name, colour: player.colour }))
      )
    )
    expect(view.results).toHaveLength(view.players.length)
  })
})

describe("ranks", () => {
  it("ranks share on ties and record the previous rank for arrows", () => {
    const game = twoPlayerGame(2)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintOn(question))
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const view = viewOf(game, tokA, T0 + 60_000)
    const a = view.players.find((player) => player.id === "p1")!
    const b = view.players.find((player) => player.id === "p2")!
    expect(a.rank).toBe(1)
    expect(b.rank).toBe(2)
    expect(a.previousRank).toBe(1)
    expect(b.previousRank).toBe(1)
  })
})
