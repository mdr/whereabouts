import { describe, expect, it } from "vite-plus/test"
import { outlineId, placeId, questionId, wikiTitle } from "@whereabouts/shared/ids"
import {
  AnswerType,
  ClueType,
  QuestionType,
  Surface,
  type Outline,
  type PlaceQuestion,
  type Question
} from "@whereabouts/shared/questions"
import { RevealedShapeType } from "./revealed-shape"
import { revealedFromQuestion } from "./revealed-from-question"

describe("revealedFromQuestion", () => {
  it("is a point question's own place", () => {
    const kyoto: PlaceQuestion = {
      type: QuestionType.PLACE,
      id: questionId("kyoto"),
      place: placeId("kyoto"),
      label: "kyoto",
      wiki: wikiTitle("kyoto"),
      clue: { type: ClueType.NAME, prompt: "Where is kyoto?" },
      answer: { type: AnswerType.POINT, at: { lat: 35, lon: 135.8 }, tolerance: 50 }
    }
    expect(revealedFromQuestion(kyoto, new Map())).toMatchObject({
      label: "kyoto",
      wiki: "kyoto",
      answer: { lat: 35, lon: 135.8 },
      shape: { type: RevealedShapeType.POINT }
    })
  })

  it("is an area's centre, with its outline", () => {
    const outline: Outline = [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0]
        ]
      ]
    ]
    const country: Question = {
      type: QuestionType.COUNTRY,
      id: questionId("square-region"),
      place: placeId("square"),
      label: "Square",
      wiki: wikiTitle("Square"),
      clue: { type: ClueType.NAME, prompt: "Paint the whole of Square" },
      answer: {
        type: AnswerType.AREA,
        outline: outlineId("square-region"),
        centre: { lat: 0.5, lon: 0.5 },
        tolerance: 20,
        surface: Surface.LAND
      }
    }
    expect(revealedFromQuestion(country, new Map([[outlineId("square-region"), outline]]))).toMatchObject({
      answer: { lat: 0.5, lon: 0.5 },
      shape: { type: RevealedShapeType.AREA, outline }
    })
  })
})
