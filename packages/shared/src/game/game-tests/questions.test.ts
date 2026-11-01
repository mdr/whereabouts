import { describe, expect, it } from "vite-plus/test"
import { latLngToCell } from "../../h3.ts"
import { type Game, ROUND_GRACE } from "../game.ts"
import { viewIn } from "../view-in.ts"
import type { QuestionBank } from "../round-picking.ts"
import { PaintLayer, resolutionForTolerance } from "../../paint/paint.ts"
import { PASS_SCORE } from "../../scoring/scoring.ts"
import { AnswerType, ClueType, FLAG_POINT_PROMPT, QuestionType, promptOf, type Question } from "../../questions.ts"
import { CATALOGUE, outlinesFrom } from "../../catalogue/catalogue.ts"
import { REVEAL_PHOTOS } from "../../catalogue/photos.ts"
import { regionCells, scoredAnswer, type Area } from "../../scoring/regions.ts"
import { type GameConfig, mixOf, MapDetail } from "../../protocol/config.ts"
import { type QuestionView, Phase, RoundGuessType } from "../../protocol/views.ts"
import outlinesJson from "../../../outlines.json" with { type: "json" }
import { playerName } from "../../ids.ts"
import { GameViewSchema } from "../../protocol/view-schema.ts"
import { Role } from "../../roles.ts"
import { landmark, T0, viewOf, tokA, tokB, tokS, makeGame } from "./support.ts"

describe("the question mix", () => {
  const OUTLINES = outlinesFrom(outlinesJson)
  const byId = (id: string) => CATALOGUE.find((question) => question.id === id)!
  const areaOf = (question: Question) => scoredAnswer(question.answer, OUTLINES) as Area
  const germany = byId("germany-region")

  function gameWith(config: Partial<GameConfig>, bank: Partial<QuestionBank> = {}) {
    const game = makeGame({
      bank: { catalogue: CATALOGUE, outlines: OUTLINES, ...bank },
      config: { roundLength: 60_000, ...config }
    })
    game.join(tokA, playerName("Alice"), T0)
    game.join(tokB, playerName("Bob"), T0 + 1)
    return game
  }

  const outlineOf = (question: QuestionView) =>
    question.answer.type === AnswerType.AREA ? question.answer.outline : undefined

  it("defaults to 2 of each type but the extras", () => {
    expect(makeGame().config.mix).toEqual(
      mixOf({ [QuestionType.LANDMARK]: 2, [QuestionType.PLACE]: 2, [QuestionType.COUNTRY]: 2, [QuestionType.FLAG]: 2 })
    )
  })

  it("sends every player and spectator views that match GameViewSchema, through every type of round", () => {
    const mix = mixOf(Object.fromEntries(Object.values(QuestionType).map((type) => [type, 1])))
    const game = gameWith({ mix, mapDetail: MapDetail.WATER })
    game.join(tokS, playerName("Sam"), T0 + 2, Role.SPECTATOR)
    let now = T0
    const check = () => {
      for (const token of [tokA, tokB, tokS]) {
        const checked = GameViewSchema.safeParse(viewOf(game, token, now))
        expect(checked.success, JSON.stringify(checked.error?.issues)).toBe(true)
      }
    }
    check()
    game.start(tokA, now)
    while (game.phase !== Phase.RESULTS) {
      const { tolerance } = viewIn(viewOf(game, tokA, now), Phase.GUESSING).round.question.answer
      const layer = new PaintLayer(resolutionForTolerance(tolerance))
      layer.stamp({ lat: 10, lon: 10 }, tolerance, 1)
      game.setPaint(tokA, { cells: layer.toRecord(), floor: 0.05 })
      game.lock(tokB, now)
      check()
      now += 60_000 + ROUND_GRACE
      game.tick(now)
      check()
      game.next(tokA, now)
    }
    check()
    expect(viewIn(viewOf(game, tokA, now), Phase.RESULTS).awards.length).toBeGreaterThan(0)
  })

  it("scores a country round against the outline, which it never sends; a pass still scores 250", () => {
    const game = gameWith({ mix: mixOf({ [QuestionType.COUNTRY]: 1 }) }, { catalogue: [germany] })
    game.start(tokA, T0)
    const question = viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round.question
    expect(outlineOf(question)).toBe("germany-region")
    expect(JSON.stringify(viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round)).not.toContain("[[")
    const resolution = resolutionForTolerance(question.answer.tolerance)
    const cells = Object.fromEntries(regionCells(areaOf(germany), resolution).map((cell) => [cell, 1]))
    expect(game.setPaint(tokA, { cells, floor: 0.05 }).ok).toBe(true)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const reveal = viewIn(viewOf(game, tokB, T0 + 60_000), Phase.REVEAL).reveal
    expect(outlineOf(reveal.question)).toBe("germany-region")
    expect(reveal.label).toBe("Germany")
    const alice = reveal.results.find((result) => result.playerId === "p1")!
    expect(alice.score).toBeGreaterThan(985)
    expect(alice.guess).toMatchObject({ type: RoundGuessType.PAINTED, parts: { type: AnswerType.AREA } })
    const bob = reveal.results.find((result) => result.playerId === "p2")!
    expect(bob.score).toBe(PASS_SCORE.score)
    expect(bob.guess).toEqual({ type: RoundGuessType.PASSED })
  })

  it("scores a small country's flag as a point and reveals its name", () => {
    const monaco = byId("flag-mc")
    const game = gameWith({ mix: mixOf({ [QuestionType.FLAG]: 1 }) }, { catalogue: [monaco] })
    game.start(tokA, T0)
    const question = viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round.question
    expect(question).toEqual({
      type: QuestionType.FLAG,
      clue: { type: ClueType.FLAG, flag: "mc" },
      answer: { type: AnswerType.POINT, tolerance: 15 }
    })
    expect(promptOf(question)).toBe(FLAG_POINT_PROMPT)
    if (monaco.answer.type !== AnswerType.POINT) throw new Error("Monaco is asked as a point")
    const { at } = monaco.answer
    const cell = latLngToCell(at.lat, at.lon, resolutionForTolerance(question.answer.tolerance))
    expect(game.setPaint(tokA, { cells: { [cell]: 1 }, floor: 0.05 }).ok).toBe(true)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const reveal = viewIn(viewOf(game, tokB, T0 + 60_000), Phase.REVEAL).reveal
    expect(reveal.label).toBe("Monaco")
    expect(reveal.question.clue).toEqual({ type: ClueType.FLAG, flag: "mc" })
    expect(reveal.results.find((result) => result.playerId === "p1")!.score).toBeGreaterThan(900)
  })
})

describe("upcoming pictures", () => {
  const photos = [landmark("one", "One.jpg"), landmark("two", "Two.jpg"), landmark("three", "Three.jpg")]
  const mix = mixOf({ [QuestionType.LANDMARK]: 2 })
  const imageOf = (game: Game, at: number) => {
    const clue = viewIn(viewOf(game, tokA, at), Phase.GUESSING).round.question.clue
    return clue.type === ClueType.PHOTO ? clue.image : undefined
  }

  it("sends round 1's photo in the lobby, the next round's while one is played, and nothing after the last", () => {
    const game = makeGame({ bank: { catalogue: photos }, config: { mix, roundLength: 60_000 } })
    game.join(tokA, playerName("Alice"), T0)
    const first = viewIn(viewOf(game, tokA, T0), Phase.LOBBY).upcoming?.image
    expect(first).toBeDefined()
    game.start(tokA, T0)
    expect(imageOf(game, T0)).toBe(first)
    const second = viewIn(viewOf(game, tokA, T0), Phase.GUESSING).upcoming?.image
    expect(second).toBeDefined()
    expect(second).not.toBe(first)
    game.tick(T0 + 60_000 + ROUND_GRACE)
    expect(viewIn(viewOf(game, tokA, T0 + 61_000), Phase.REVEAL).upcoming?.image).toBe(second)
    game.next(tokA, T0 + 62_000)
    expect(imageOf(game, T0 + 62_000)).toBe(second)
    expect(viewIn(viewOf(game, tokA, T0 + 62_000), Phase.GUESSING).upcoming).toBeUndefined()
  })

  it("sends a place-name round's reveal photo with its pictures, and shows it at the reveal", () => {
    const paris = CATALOGUE.find((question) => question.id === "paris")!
    const game = makeGame({
      bank: { catalogue: [paris] },
      config: { mix: mixOf({ [QuestionType.PLACE]: 1 }), roundLength: 60_000 }
    })
    game.join(tokA, playerName("Alice"), T0)
    const photo = viewIn(viewOf(game, tokA, T0), Phase.LOBBY).upcoming?.revealPhoto
    expect(photo).toBeDefined()
    expect(photo).toBe(REVEAL_PHOTOS[paris.place])
    game.start(tokA, T0)
    expect(imageOf(game, T0)).toBeUndefined()
    game.tick(T0 + 60_000 + ROUND_GRACE)
    const view = viewIn(viewOf(game, tokA, T0 + 61_000), Phase.REVEAL)
    expect(view.reveal.photo).toBe(photo)
    game.next(tokA, T0 + 62_000)
    expect(viewIn(viewOf(game, tokA, T0 + 62_000), Phase.RESULTS).playedRounds[0]?.revealPhoto).toBe(photo)
  })

  it("picks the rounds again when the host changes the setup, so round 1's photo is still the one asked", () => {
    const game = makeGame({ bank: { catalogue: photos }, config: { mix, roundLength: 60_000 } })
    game.join(tokA, playerName("Alice"), T0)
    game.configure(tokA, { mix: mixOf({ [QuestionType.LANDMARK]: 3 }) })
    const first = viewIn(viewOf(game, tokA, T0), Phase.LOBBY).upcoming?.image
    game.start(tokA, T0)
    expect(imageOf(game, T0)).toBe(first)
  })
})
