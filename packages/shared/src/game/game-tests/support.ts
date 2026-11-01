import { expect } from "vite-plus/test"
import { Game } from "../game.ts"
import { viewIn } from "../view-in.ts"
import type { QuestionBank } from "../round-picking.ts"
import { PaintLayer, resolutionForTolerance } from "../../paint/paint.ts"
import {
  AnswerType,
  ClueType,
  QuestionType,
  promptOf,
  type LandmarkQuestion,
  type PlaceQuestion,
  type Question
} from "../../questions.ts"
import { type GameConfig, mixOf } from "../../protocol/config.ts"
import { type GameView, Phase } from "../../protocol/views.ts"
import {
  commonsFile,
  placeId,
  playerName,
  playerToken,
  questionId,
  roomCode,
  wikiTitle,
  type PlayerToken,
  type RoomCode
} from "../../ids.ts"
import type { LatLon } from "../../geo.ts"

const place = (label: string, at: LatLon, tolerance = 100): PlaceQuestion => ({
  type: QuestionType.PLACE,
  id: questionId(label.toLowerCase()),
  place: placeId(label.toLowerCase()),
  label,
  wiki: wikiTitle(label),
  clue: { type: ClueType.NAME, prompt: `Where is ${label}?` },
  answer: { type: AnswerType.POINT, at, tolerance }
})
export const petra = place("Petra", { lat: 30.3285, lon: 35.4444 }, 200)
const paris = place("Paris", { lat: 48.8566, lon: 2.3522 })
const tokyo = place("Tokyo", { lat: 35.6762, lon: 139.6503 })
export const pool = [petra, paris, tokyo]

export const landmark = (id: string, image: string): LandmarkQuestion => ({
  type: QuestionType.LANDMARK,
  id: questionId(id),
  place: placeId(id),
  label: id,
  wiki: wikiTitle(id),
  clue: { type: ClueType.PHOTO, image: commonsFile(image) },
  answer: petra.answer
})

export const T0 = 1_000_000
const CODE = roomCode("ABCD")

/** A test player's seat token: tok("A") is tokA. */
export const tok = (name: string) => playerToken(`tok${name}`.padEnd(16, "-"))
/** A seated token's view. */
export const viewOf = (game: Game, token: PlayerToken, now: number): GameView => {
  const view = game.view(token, now)
  if (!view) throw new Error("expected a view, got none")
  return view
}

export const tokA = tok("A")
export const tokB = tok("B")
export const tokC = tok("C")
export const tokD = tok("D")
export const tokH = tok("H")
export const tokLate = tok("Late")
export const tokNew = tok("New")
export const tokS = tok("S")
export const tokW = tok("W")
export const tokW1 = tok("W1")
export const tokZ = tok("Z")

export const paintAt = (question: Question, lat: number, lon: number) => {
  const layer = new PaintLayer(resolutionForTolerance(question.answer.tolerance))
  layer.stamp({ lat, lon }, question.answer.tolerance / 2, 1)
  return { cells: layer.toRecord(), floor: 0.05 }
}

/** Paint on a place's answer. */
export const paintOn = (question: PlaceQuestion) => paintAt(question, question.answer.at.lat, question.answer.at.lon)

/** The three test places and no outlines. */
const makeBank = (bank: Partial<QuestionBank> = {}): QuestionBank => ({
  catalogue: pool,
  outlines: new Map(),
  ...bank
})

export const makeGame = ({
  code = CODE,
  bank,
  config,
  seed = 42
}: { code?: RoomCode; bank?: Partial<QuestionBank>; config?: Partial<GameConfig>; seed?: number } = {}): Game =>
  new Game(code, makeBank(bank), { config, seed })

export const twoPlayerGame = (rounds = 2) => {
  // The test pool is place names only.
  const mix = mixOf({ [QuestionType.PLACE]: rounds })
  const game = makeGame({ config: { mix, roundLength: 60_000 } })
  expect(game.join(tokA, playerName("Alice"), T0).ok).toBe(true)
  expect(game.join(tokB, playerName("Bob"), T0 + 1).ok).toBe(true)
  return game
}

/** The question currently being asked, read back through a view. */
export const currentQuestion = (game: Game, token: PlayerToken, now: number): PlaceQuestion => {
  const prompt = promptOf(viewIn(viewOf(game, token, now), Phase.GUESSING).round.question)
  return pool.find((question) => question.clue.prompt === prompt)!
}
