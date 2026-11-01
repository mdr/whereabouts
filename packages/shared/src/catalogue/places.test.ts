import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE, PLACES } from "./catalogue.ts"
import { AnswerType, QUESTION_TYPES } from "../questions.ts"

describe("the places", () => {
  it("are each asked about", () => {
    const asked = new Set(CATALOGUE.map((question) => question.place))
    expect([...PLACES.keys()].filter((id) => !asked.has(id))).toEqual([])
  })

  it("have one article each", () => {
    const wikis = [...PLACES.values()].map((place) => place.wiki)
    expect(new Set(wikis).size).toBe(wikis.length)
  })

  it("have an area where a round paints them, and only there", () => {
    const painted = new Set(
      CATALOGUE.filter((question) => question.answer.type === AnswerType.AREA).map((question) => question.place)
    )
    expect(
      [...PLACES.values()].filter((place) => !!place.area !== painted.has(place.id)).map((place) => place.id)
    ).toEqual([])
  })

  it("have a point where a round asks for one, and only there", () => {
    const pointed = new Set(
      CATALOGUE.filter((question) => question.answer.type === AnswerType.POINT).map((question) => question.place)
    )
    expect(
      [...PLACES.values()].filter((place) => !!place.at !== pointed.has(place.id)).map((place) => place.id)
    ).toEqual([])
  })

  it("are asked at most once by each type of question", () => {
    for (const type of QUESTION_TYPES) {
      const places = CATALOGUE.filter((question) => question.type === type).map((question) => question.place)
      expect(new Set(places).size, type).toBe(places.length)
    }
  })
})
