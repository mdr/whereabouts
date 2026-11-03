import { describe, expect, it } from "vite-plus/test"
import { viewIn } from "../view-in.ts"
import { ClueType, QuestionType } from "../../questions.ts"
import { type ConfigurePatch, mixOf, mixTotal, MapDetail, type QuestionMix } from "../../protocol/config.ts"
import { Phase } from "../../protocol/views.ts"
import { playerName } from "../../ids.ts"
import { pool, landmark, T0, viewOf, tokA, tokB, paintAt, makeGame, twoPlayerGame, currentQuestion } from "./support.ts"

describe("configure", () => {
  const places = (count: number): QuestionMix => mixOf({ [QuestionType.PLACE]: count })
  const landmarks = (count: number): QuestionMix => mixOf({ [QuestionType.LANDMARK]: count })

  it("lets the host change the mix, and so the rounds, and round length in the lobby only", () => {
    const game = twoPlayerGame()
    expect(game.configure(tokB, { mix: places(3) })).toEqual({ ok: false, error: "only the host can change settings" })
    expect(game.configure(tokA, { mix: places(3) })).toEqual({ ok: true, changed: true })
    expect(game.configure(tokA, { mix: places(3) })).toEqual({ ok: true, changed: false })
    expect(game.configure(tokA, { roundLength: 30_000 }).ok).toBe(true)
    const view = viewOf(game, tokB, T0)
    expect(mixTotal(view.config.mix)).toBe(3)
    expect(view.config.roundLength).toBe(30_000)
    game.start(tokA, T0)
    expect(viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round.total).toBe(3)
    expect(viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round.deadline).toBe(T0 + 30_000)
    expect(game.configure(tokA, { mix: places(5) })).toEqual({
      ok: false,
      error: "settings are locked once the game starts"
    })
  })

  it("sees a change to any setting the host may make, and no change when it is set to what it was", () => {
    // Typed so that a new setting must be added here.
    const changes: Required<ConfigurePatch> = {
      roundLength: 30_000,
      mix: places(3),
      mapDetail: MapDetail.PHYSICAL,
      hints: 3
    }
    for (const [key, value] of Object.entries(changes)) {
      const game = twoPlayerGame()
      expect(game.configure(tokA, { [key]: value }), key).toEqual({ ok: true, changed: true })
      expect(game.configure(tokA, { [key]: value }), key).toEqual({ ok: true, changed: false })
    }
  })

  it("the question mix reaches the picker", () => {
    const game = makeGame({
      bank: { catalogue: [...pool, landmark("petra-photo", "Petra.jpg")] },
      config: { mix: places(1) }
    })
    game.join(tokA, playerName("Alice"), T0)
    expect(game.configure(tokA, { mix: landmarks(1) })).toEqual({ ok: true, changed: true })
    expect(game.configure(tokA, { mix: landmarks(1) })).toEqual({ ok: true, changed: false })
    expect(viewOf(game, tokA, T0).config.mix).toEqual(landmarks(1))
    game.start(tokA, T0)
    // One round, a landmark: it must be the one landmark in the catalogue.
    expect(viewIn(viewOf(game, tokA, T0), Phase.GUESSING).round.question.clue).toEqual({
      type: ClueType.PHOTO,
      image: "Petra.jpg"
    })
  })

  it("starts on minimal map detail and lets the host change it in the lobby", () => {
    const game = twoPlayerGame(1)
    expect(viewOf(game, tokB, T0).config.mapDetail).toBe(MapDetail.MINIMAL)
    expect(game.configure(tokB, { mapDetail: MapDetail.WATER }).ok).toBe(false)
    expect(game.configure(tokA, { mapDetail: MapDetail.PHYSICAL })).toEqual({ ok: true, changed: true })
    expect(game.configure(tokA, { mapDetail: MapDetail.PHYSICAL })).toEqual({ ok: true, changed: false })
    expect(viewOf(game, tokB, T0).config.mapDetail).toBe(MapDetail.PHYSICAL)
    game.start(tokA, T0)
    expect(game.configure(tokA, { mapDetail: MapDetail.POLITICAL }).ok).toBe(false)
  })

  it("reports who has locked in", () => {
    const game = twoPlayerGame(1)
    game.start(tokA, T0)
    const question = currentQuestion(game, tokA, T0)
    game.setPaint(tokA, paintAt(question, 0, 0))
    game.lock(tokA, T0 + 1)
    const players = viewOf(game, tokB, T0 + 1).players
    expect(players.find((player) => player.id === "p1")!.locked).toBe(true)
    expect(players.find((player) => player.id === "p2")!.locked).toBe(false)
  })
})
