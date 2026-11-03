import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE } from "../catalogue/catalogue.ts"
import { playedRound, questionPicture, questionView, revealOf } from "./question-views.ts"
import { h3Resolution } from "../h3.ts"
import { playerColour } from "../colours.ts"
import { playerId, playerName } from "../ids.ts"
import { REVEAL_PHOTOS, revealPhoto } from "../catalogue/photos.ts"
import { PictureType, RoundGuessType, flagShown, type RoundResultView } from "../protocol/views.ts"
import {
  AnswerType,
  ClueType,
  FLAG_POINT_PROMPT,
  QuestionType,
  answerCentre,
  clueImage,
  promptOf,
  type Question
} from "../questions.ts"

const byId = (id: string): Question => CATALOGUE.find((question) => question.id === id)!
const ofType = (type: QuestionType): Question[] => CATALOGUE.filter((question) => question.type === type)

describe("questionView", () => {
  it("never says where the answer is, or what it is called", () => {
    for (const question of CATALOGUE) {
      const view = questionView(question)
      expect(Object.keys(view.answer).sort(), question.id).toEqual(
        question.answer.type === AnswerType.AREA
          ? [...(question.answer.disputed ? ["disputed"] : []), "outline", "surface", "tolerance", "type"]
          : ["tolerance", "type"]
      )
      expect(JSON.stringify(view), question.id).not.toContain(`"${question.label}"`)
    }
  })

  it("shows a flag round's flag, never the name, and says whether to paint the country or a point", () => {
    for (const question of ofType(QuestionType.FLAG)) {
      const view = questionView(question)
      expect(view.clue.type, question.id).toBe(ClueType.FLAG)
      expect(promptOf(view), question.id).not.toContain(question.label)
      if (question.answer.type === AnswerType.POINT) expect(promptOf(view), question.id).toBe(FLAG_POINT_PROMPT)
    }
  })

  it("keeps each type's clue", () => {
    for (const question of CATALOGUE) {
      expect(questionView(question), question.id).toMatchObject({ type: question.type, clue: question.clue })
    }
  })

  it("names a feature's kind, and gives a country with a flag its flag", () => {
    const borneo = byId("island-borneo")
    expect(questionView(borneo)).toMatchObject({
      type: QuestionType.FEATURE,
      feature: borneo.type === QuestionType.FEATURE && borneo.feature
    })
    expect(questionView(byId("germany-region"))).toMatchObject({ type: QuestionType.COUNTRY, countryFlag: "de" })
  })
})

describe("questionPicture", () => {
  it("gives a landmark's photo, a flag round's flag and a place's reveal photo", () => {
    const landmark = ofType(QuestionType.LANDMARK)[0]!
    expect(questionPicture(landmark)).toEqual({ type: PictureType.PHOTO, photo: clueImage(landmark.clue) })
    expect(questionPicture(byId("flag-mc"))).toEqual({ type: PictureType.FLAG, flag: "mc" })
    expect(questionPicture(byId("germany-region"))).toEqual({ type: PictureType.FLAG, flag: "de" })
    const paris = byId("paris")
    expect(questionPicture(paris)).toEqual({ type: PictureType.PHOTO, photo: REVEAL_PHOTOS[paris.place] })
  })

  it("has at most one picture, so the one sent loses nothing", () => {
    for (const question of CATALOGUE) {
      const pictures = [clueImage(question.clue), flagShown(question), revealPhoto(question)]
      expect(pictures.filter((picture) => picture !== undefined).length, question.id).toBeLessThanOrEqual(1)
    }
  })
})

describe("playedRound", () => {
  it("gives a country its shape and flag, and a feature its shape", () => {
    const germany = byId("germany-region")
    if (germany.answer.type !== AnswerType.AREA) throw new Error("Germany is an area")
    expect(playedRound(germany)).toEqual({
      type: QuestionType.COUNTRY,
      label: "Germany",
      picture: { type: PictureType.SHAPE, outline: germany.answer.outline, centre: germany.answer.centre },
      countryFlag: "de"
    })
    expect(playedRound(byId("island-borneo"))).toMatchObject({
      type: QuestionType.FEATURE,
      picture: { type: PictureType.SHAPE }
    })
  })

  it("shows a flag round's flag, even where its answer is an area, and a place's reveal photo", () => {
    const flag = ofType(QuestionType.FLAG).find((question) => question.answer.type === AnswerType.AREA)!
    expect(playedRound(flag).picture.type).toBe(PictureType.FLAG)
    const paris = byId("paris")
    expect(playedRound(paris).picture).toEqual({ type: PictureType.PHOTO, photo: REVEAL_PHOTOS[paris.place] })
  })
})

describe("revealOf", () => {
  it("shows the answer, its name and article, and the results as given", () => {
    const paris = byId("paris")
    const results: RoundResultView[] = [
      {
        playerId: playerId("p1"),
        name: playerName("Alice"),
        colour: playerColour(0),
        score: 900,
        guess: {
          type: RoundGuessType.PAINTED,
          paint: { cells: {}, floor: 0 },
          resolution: h3Resolution(5),
          parts: { type: AnswerType.POINT, A: 0.9, B: 0.8 }
        }
      }
    ]
    expect(revealOf(paris, { index: 2, total: 8 }, results)).toEqual({
      index: 2,
      total: 8,
      question: questionView(paris),
      answer: answerCentre(paris.answer),
      place: paris.place,
      label: paris.label,
      wiki: paris.wiki,
      photo: REVEAL_PHOTOS[paris.place],
      results
    })
  })
})
