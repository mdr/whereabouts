import { describe, expect, it } from "vite-plus/test"
import outlinesJson from "../outlines.json" with { type: "json" }
import { CATALOGUE, outlinesFrom } from "./catalogue/catalogue.ts"
import {
  AnswerType,
  ClueType,
  FLAG_AREA_PROMPT,
  FLAG_POINT_PROMPT,
  PHOTO_PROMPT,
  QuestionType,
  Surface,
  answerCentre,
  promptOf,
  wikipediaUrl,
  type AreaAnswer,
  type Clue,
  type PointAnswer
} from "./questions.ts"
import { greatCircleDistance } from "./geo.ts"
import { commonsFile, flagCode, outlineId, wikiTitle } from "./ids.ts"

describe("wikipediaUrl", () => {
  it("links the article", () => {
    expect(wikipediaUrl(wikiTitle("St. Peter's Basilica"))).toBe("https://en.wikipedia.org/wiki/St._Peter's_Basilica")
  })
})

const point: PointAnswer = { type: AnswerType.POINT, at: { lat: 1, lon: 2 }, tolerance: 10 }
const area: AreaAnswer = {
  type: AnswerType.AREA,
  outline: outlineId("somewhere"),
  centre: { lat: 3, lon: 4 },
  tolerance: 10,
  surface: Surface.LAND
}

describe("promptOf", () => {
  it("asks a photo where it is, a name as written, and a flag by how it is painted", () => {
    const photo: Clue = { type: ClueType.PHOTO, image: commonsFile("x.jpg") }
    const name: Clue = { type: ClueType.NAME, prompt: "Where are the Seychelles?" }
    const flag: Clue = { type: ClueType.FLAG, flag: flagCode("de") }
    expect(promptOf({ clue: photo, answer: point })).toBe(PHOTO_PROMPT)
    expect(promptOf({ clue: name, answer: point })).toBe("Where are the Seychelles?")
    expect(promptOf({ clue: flag, answer: area })).toBe(FLAG_AREA_PROMPT)
    expect(promptOf({ clue: flag, answer: point })).toBe(FLAG_POINT_PROMPT)
  })
})

describe("answerCentre", () => {
  it("is a point's own place, or an area's centre", () => {
    expect(answerCentre(point)).toEqual({ lat: 1, lon: 2 })
    expect(answerCentre(area)).toEqual({ lat: 3, lon: 4 })
  })
})

describe("the catalogue", () => {
  const outlines = outlinesFrom(outlinesJson)

  it("has unique ids, valid coordinates and sensible tolerances", () => {
    expect(new Set(CATALOGUE.map((question) => question.id)).size).toBe(CATALOGUE.length)
    for (const question of CATALOGUE) {
      const at = answerCentre(question.answer)
      expect(Math.abs(at.lat), question.id).toBeLessThanOrEqual(90)
      expect(Math.abs(at.lon), question.id).toBeLessThanOrEqual(180)
      expect(question.answer.tolerance, question.id).toBeGreaterThanOrEqual(1)
      expect(question.answer.tolerance, question.id).toBeLessThanOrEqual(1500)
      expect(promptOf(question).length, question.id).toBeGreaterThan(0)
      expect(question.label.length, question.id).toBeGreaterThan(0)
      expect(question.wiki.length, `${question.id} needs a Wikipedia article`).toBeGreaterThan(0)
    }
  })

  it("has an outline for every area answer, and none unused", () => {
    const used = new Set<string>()
    for (const question of CATALOGUE)
      if (question.answer.type === AnswerType.AREA) {
        expect(outlines.get(question.answer.outline)?.length, question.id).toBeGreaterThan(0)
        used.add(question.answer.outline)
      }
    expect([...outlines.keys()].filter((id) => !used.has(id))).toEqual([])
  })

  it("names the place in a place's prompt, and not in a landmark's", () => {
    const prompts = (type: QuestionType) => CATALOGUE.filter((question) => question.type === type).map(promptOf)
    expect(prompts(QuestionType.PLACE).filter((prompt) => !/^Where (is|are) /.test(prompt))).toEqual([])
    expect(new Set(prompts(QuestionType.LANDMARK))).toEqual(new Set([PHOTO_PROMPT]))
  })

  const places = CATALOGUE.filter((question) => question.type === QuestionType.PLACE)

  it("keeps a healthy mix of scales", () => {
    expect(places.length).toBeGreaterThanOrEqual(100)
    expect(places.filter((question) => question.answer.tolerance <= 60).length).toBeGreaterThanOrEqual(8)
    expect(places.filter((question) => question.answer.tolerance >= 700).length).toBeGreaterThanOrEqual(8)
  })

  it("does not put two places on the same spot", () => {
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) {
        const distance = greatCircleDistance(answerCentre(places[i]!.answer), answerCentre(places[j]!.answer))
        // Rome and Vatican City are the one deliberate near-pair.
        const pair = [places[i]!.id, places[j]!.id].sort().join("+")
        if (pair === "rome+vatican") continue
        expect(distance, `${places[i]!.id} and ${places[j]!.id} are ${distance.toFixed(0)} km apart`).toBeGreaterThan(
          20
        )
      }
    }
  })
})
