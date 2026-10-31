import { describe, expect, it } from "vite-plus/test"
import outlinesJson from "../outlines.json" with { type: "json" }
import { CATALOGUE, outlinesFrom } from "./catalogue.ts"
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
  it("links the article, or searches for the label without one", () => {
    expect(wikipediaUrl(wikiTitle("St. Peter's Basilica"), "St Peter's Basilica, Vatican City")).toBe(
      "https://en.wikipedia.org/wiki/St._Peter's_Basilica"
    )
    expect(wikipediaUrl(undefined, "Oia, Santorini")).toBe(
      "https://en.wikipedia.org/w/index.php?search=Oia%2C%20Santorini"
    )
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
    expect(new Set(CATALOGUE.map((q) => q.id)).size).toBe(CATALOGUE.length)
    for (const q of CATALOGUE) {
      const at = answerCentre(q.answer)
      expect(Math.abs(at.lat), q.id).toBeLessThanOrEqual(90)
      expect(Math.abs(at.lon), q.id).toBeLessThanOrEqual(180)
      expect(q.answer.tolerance, q.id).toBeGreaterThanOrEqual(1)
      expect(q.answer.tolerance, q.id).toBeLessThanOrEqual(1500)
      expect(promptOf(q).length, q.id).toBeGreaterThan(0)
      expect(q.label.length, q.id).toBeGreaterThan(0)
      expect(q.wiki.length, `${q.id} needs a Wikipedia article`).toBeGreaterThan(0)
    }
  })

  it("has an outline for every area answer, and none unused", () => {
    const used = new Set<string>()
    for (const q of CATALOGUE)
      if (q.answer.type === AnswerType.AREA) {
        expect(outlines.get(q.answer.outline)?.length, q.id).toBeGreaterThan(0)
        used.add(q.answer.outline)
      }
    expect([...outlines.keys()].filter((id) => !used.has(id))).toEqual([])
  })

  it("names the place in a place's prompt, and not in a landmark's", () => {
    const prompts = (type: QuestionType) => CATALOGUE.filter((q) => q.type === type).map(promptOf)
    expect(prompts(QuestionType.PLACE).filter((p) => !/^Where (is|are) /.test(p))).toEqual([])
    expect(new Set(prompts(QuestionType.LANDMARK))).toEqual(new Set([PHOTO_PROMPT]))
  })

  const places = CATALOGUE.filter((q) => q.type === QuestionType.PLACE)

  it("keeps a healthy mix of scales", () => {
    expect(places.length).toBeGreaterThanOrEqual(100)
    expect(places.filter((q) => q.answer.tolerance <= 60).length).toBeGreaterThanOrEqual(8)
    expect(places.filter((q) => q.answer.tolerance >= 700).length).toBeGreaterThanOrEqual(8)
  })

  it("does not put two places on the same spot", () => {
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) {
        const d = greatCircleDistance(answerCentre(places[i]!.answer), answerCentre(places[j]!.answer))
        // Rome and Vatican City are the one deliberate near-pair.
        const pair = [places[i]!.id, places[j]!.id].sort().join("+")
        if (pair === "rome+vatican") continue
        expect(d, `${places[i]!.id} and ${places[j]!.id} are ${d.toFixed(0)} km apart`).toBeGreaterThan(20)
      }
    }
  })
})
