import { describe, expect, it } from "vite-plus/test"
import { ROUND_GRACE, type Game } from "../game.ts"
import { viewIn } from "../view-in.ts"
import { QuestionType, type PlaceQuestion } from "../../questions.ts"
import { mixOf } from "../../protocol/config.ts"
import { Phase } from "../../protocol/views.ts"
import { playerName } from "../../ids.ts"
import { inHintBand, HintAxis } from "../../hints.ts"
import { Role, YouRoleType } from "../../roles.ts"
import { T0, viewOf, tokA, tokB, tokW, makeGame, twoPlayerGame, currentQuestion } from "./support.ts"

describe("hints", () => {
  const hintGame = (): Game => {
    const game = makeGame({
      config: { mix: mixOf({ [QuestionType.PLACE]: 3 }), hints: 2 }
    })
    game.join(tokA, playerName("Alice"), T0)
    game.join(tokB, playerName("Bob"), T0)
    return game
  }
  const inFirstRound = (): { game: Game; question: PlaceQuestion } => {
    const game = hintGame()
    game.start(tokA, T0)
    return { game, question: currentQuestion(game, tokA, T0) }
  }

  it("starts each player with the host's allowance, and gives no hint before a round", () => {
    const game = hintGame()
    expect(game.hint(tokA, HintAxis.LATITUDE)).toEqual({ ok: false, error: "no round to hint" })
    game.start(tokA, T0)
    expect(viewOf(game, tokA, T0).you.role).toMatchObject({ hintsLeft: 2 })
  })

  it("gives a band on the asked axis that holds the answer, and uses up a hint", () => {
    const { game, question } = inFirstRound()
    expect(game.hint(tokA, HintAxis.LATITUDE)).toEqual({ ok: true, changed: true })
    const band = viewIn(viewOf(game, tokA, T0), Phase.GUESSING).you.hint!
    expect(band.axis).toBe(HintAxis.LATITUDE)
    expect(inHintBand(band, question.answer.at)).toBe(true)
    expect(viewOf(game, tokA, T0).you.role).toMatchObject({ hintsLeft: 1 })
  })

  it("gives everyone who asks for the same axis the same band", () => {
    const { game } = inFirstRound()
    game.hint(tokA, HintAxis.LATITUDE)
    expect(game.hint(tokB, HintAxis.LATITUDE).ok).toBe(true)
    expect(viewIn(viewOf(game, tokB, T0), Phase.GUESSING).you.hint).toEqual(
      viewIn(viewOf(game, tokA, T0), Phase.GUESSING).you.hint
    )
  })

  it("allows one hint per round", () => {
    const { game } = inFirstRound()
    game.hint(tokA, HintAxis.LATITUDE)
    expect(game.hint(tokA, HintAxis.LONGITUDE)).toEqual({ ok: false, error: "one hint per round" })
  })

  it("keeps the hint at the reveal, and records the axis against each result", () => {
    const { game } = inFirstRound()
    game.hint(tokA, HintAxis.LATITUDE)
    game.hint(tokB, HintAxis.LATITUDE)
    const band = viewIn(viewOf(game, tokA, T0), Phase.GUESSING).you.hint
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const reveal = viewIn(viewOf(game, tokA, T0 + 61_000), Phase.REVEAL)
    expect(reveal.you.hint).toEqual(band)
    expect(reveal.reveal.results.map((result) => result.hint)).toEqual([HintAxis.LATITUDE, HintAxis.LATITUDE])
  })

  it("starts the next round without a hint, and allows another", () => {
    const { game } = inFirstRound()
    game.hint(tokA, HintAxis.LATITUDE)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.next(tokA, T0 + 62_000)
    expect(viewIn(viewOf(game, tokA, T0 + 62_000), Phase.GUESSING).you.hint).toBeUndefined()
    expect(game.hint(tokA, HintAxis.LONGITUDE).ok).toBe(true)
  })

  it("refuses a hint once the host's allowance is used", () => {
    const { game } = inFirstRound()
    game.hint(tokA, HintAxis.LATITUDE)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    game.next(tokA, T0 + 62_000)
    game.hint(tokA, HintAxis.LONGITUDE)
    game.tick(T0 + 122_000 + ROUND_GRACE)
    game.next(tokA, T0 + 124_000)
    expect(game.hint(tokA, HintAxis.LATITUDE)).toEqual({ ok: false, error: "no hints left" })
    expect(viewOf(game, tokA, T0 + 124_000).you.role).toMatchObject({ hintsLeft: 0 })
  })

  it("lets the host set 0 to 3, and gives spectators none", () => {
    const none = twoPlayerGame()
    expect(none.configure(tokA, { hints: 0 })).toEqual({ ok: true, changed: true })
    none.start(tokA, T0)
    expect(viewOf(none, tokA, T0).you.role).toMatchObject({ hintsLeft: 0 })
    const game = twoPlayerGame()
    game.join(tokW, playerName("Wes"), T0, Role.SPECTATOR)
    game.configure(tokA, { hints: 3 })
    game.start(tokA, T0)
    expect(viewOf(game, tokA, T0).you.role).toMatchObject({ hintsLeft: 3 })
    expect(viewOf(game, tokW, T0).you.role).toEqual({ type: YouRoleType.SPECTATOR })
    expect(game.hint(tokW, HintAxis.LATITUDE)).toEqual({ ok: false, error: "you are not playing this round" })
  })
})
