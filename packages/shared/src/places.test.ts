import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE, PLACES } from "./catalogue.ts"
import { AnswerType, QUESTION_TYPES } from "./questions.ts"

describe("the places", () => {
  it("are each asked about", () => {
    const asked = new Set(CATALOGUE.map((q) => q.place))
    expect([...PLACES.keys()].filter((id) => !asked.has(id))).toEqual([])
  })

  it("have one article each", () => {
    const wikis = [...PLACES.values()].map((p) => p.wiki)
    expect(new Set(wikis).size).toBe(wikis.length)
  })

  it("have an area where a round paints them, and only there", () => {
    const painted = new Set(CATALOGUE.filter((q) => q.answer.type === AnswerType.AREA).map((q) => q.place))
    expect([...PLACES.values()].filter((p) => !!p.area !== painted.has(p.id)).map((p) => p.id)).toEqual([])
  })

  it("are asked at most once by each type of question", () => {
    for (const type of QUESTION_TYPES) {
      const places = CATALOGUE.filter((q) => q.type === type).map((q) => q.place)
      expect(new Set(places).size, type).toBe(places.length)
    }
  })
})
