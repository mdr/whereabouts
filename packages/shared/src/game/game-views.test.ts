import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE } from "../catalogue/catalogue.ts"
import { playedRound, questionPictures, questionView, revealOf } from "./game-views.ts"
import { h3Res } from "../h3.ts"
import { playerId } from "../ids.ts"
import { REVEAL_PHOTOS } from "../catalogue/photos.ts"
import type { RoundResultView } from "../protocol.ts"
import { AnswerType, ClueType, FLAG_POINT_PROMPT, QuestionType, answerCentre, promptOf } from "../questions.ts"

const byId = (id: string) => CATALOGUE.find((q) => q.id === id)!
const ofType = (type: QuestionType) => CATALOGUE.filter((q) => q.type === type)

describe("questionView", () => {
  it("never says where the answer is, or what it is called", () => {
    for (const q of CATALOGUE) {
      const view = questionView(q)
      expect(Object.keys(view.answer).sort(), q.id).toEqual(
        q.answer.type === AnswerType.AREA ? ["outline", "surface", "tolerance", "type"] : ["tolerance", "type"]
      )
      expect(JSON.stringify(view), q.id).not.toContain(`"${q.label}"`)
    }
  })

  it("shows a flag round's flag, never the name, and says whether to paint the country or a point", () => {
    for (const q of ofType(QuestionType.FLAG)) {
      const view = questionView(q)
      expect(view.clue.type, q.id).toBe(ClueType.FLAG)
      expect(promptOf(view), q.id).not.toContain(q.label)
      if (q.answer.type === AnswerType.POINT) expect(promptOf(view), q.id).toBe(FLAG_POINT_PROMPT)
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
    const flag = ofType(QuestionType.FLAG).find((q) => q.answer.type === AnswerType.AREA)!
    expect(playedRound(flag).area).toBeUndefined()
  })
})

describe("revealOf", () => {
  it("shows the answer, its name and article, and the results as given", () => {
    const paris = byId("paris")
    const results: RoundResultView[] = [
      { playerId: playerId("p1"), score: 900, parts: { type: AnswerType.POINT, A: 0.9, B: 0.8 }, res: h3Res(5) }
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
