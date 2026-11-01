import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE } from "../catalogue/catalogue.ts"
import { playedRound, questionPictures, questionView, revealOf } from "./game-views.ts"
import { h3Res } from "../h3.ts"
import { playerId } from "../ids.ts"
import { REVEAL_PHOTOS } from "../catalogue/photos.ts"
import { RoundGuessType, type RoundResultView } from "../protocol/views.ts"
import { AnswerType, ClueType, FLAG_POINT_PROMPT, QuestionType, answerCentre, promptOf } from "../questions.ts"

const byId = (id: string) => CATALOGUE.find((question) => question.id === id)!
const ofType = (type: QuestionType) => CATALOGUE.filter((question) => question.type === type)

describe("questionView", () => {
  it("never says where the answer is, or what it is called", () => {
    for (const question of CATALOGUE) {
      const view = questionView(question)
      expect(Object.keys(view.answer).sort(), question.id).toEqual(
        question.answer.type === AnswerType.AREA ? ["outline", "surface", "tolerance", "type"] : ["tolerance", "type"]
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

  it("names a feature's kind, and gives a country with a flag its flag", () => {
    const borneo = byId("island-borneo")
    expect(questionView(borneo)).toMatchObject({ feature: borneo.type === QuestionType.FEATURE && borneo.feature })
    expect(questionView(byId("germany-region")).countryFlag).toBe("de")
  })
})

describe("questionPictures", () => {
  it("gives a landmark's photo, a flag round's flag and a place's reveal photo", () => {
    const landmark = ofType(QuestionType.LANDMARK)[0]!
    expect(questionPictures(landmark).image).toBe(landmark.clue.type === ClueType.PHOTO && landmark.clue.image)
    expect(questionPictures(byId("flag-mc")).flag).toBe("mc")
    const paris = byId("paris")
    expect(questionPictures(paris)).toEqual({ revealPhoto: REVEAL_PHOTOS[paris.place] })
  })
})

describe("playedRound", () => {
  it("gives the area of a round that asked for a shape by name, and not of a flag's", () => {
    const germany = byId("germany-region")
    if (germany.answer.type !== AnswerType.AREA) throw new Error("Germany is an area")
    expect(playedRound(germany)).toMatchObject({
      label: "Germany",
      area: { outline: germany.answer.outline, centre: germany.answer.centre }
    })
    const flag = ofType(QuestionType.FLAG).find((question) => question.answer.type === AnswerType.AREA)!
    expect(playedRound(flag).area).toBeUndefined()
  })
})

describe("revealOf", () => {
  it("shows the answer, its name and article, and the results as given", () => {
    const paris = byId("paris")
    const results: RoundResultView[] = [
      {
        playerId: playerId("p1"),
        score: 900,
        guess: {
          type: RoundGuessType.PAINTED,
          paint: { cells: {}, floor: 0 },
          res: h3Res(5),
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
