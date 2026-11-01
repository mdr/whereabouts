import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE } from "./catalogue.ts"
import { REVEAL_PHOTOS, revealPhoto } from "./photos.ts"
import { QuestionType, clueImage } from "../questions.ts"

const of = (...types: QuestionType[]) => CATALOGUE.filter((question) => types.includes(question.type))

describe("the reveal photos", () => {
  const shown = new Set<string>(
    of(QuestionType.PLACE, QuestionType.FEATURE, QuestionType.STATE).map((question) => question.place)
  )

  it("are for places a round shows them for", () => {
    expect(Object.keys(REVEAL_PHOTOS).filter((place) => !shown.has(place))).toEqual([])
  })

  it("are JPEG files, none of them a photo round's own photo", () => {
    const asked = new Set(CATALOGUE.map((question) => clueImage(question.clue)))
    for (const [place, file] of Object.entries(REVEAL_PHOTOS)) {
      expect(file, place).toMatch(/\.jpe?g$/i)
      expect(file, place).not.toMatch(/^File:/)
      expect(asked.has(file), `${place}: ${file}`).toBe(false)
    }
  })

  it("give every place-name, island, lake, sea and US state round a photo", () => {
    for (const question of of(QuestionType.PLACE, QuestionType.FEATURE, QuestionType.STATE))
      expect(revealPhoto(question), question.id).toBeDefined()
  })

  it("show no photo on a country or flag round, which shows the flag", () => {
    for (const question of of(QuestionType.COUNTRY, QuestionType.FLAG))
      expect(revealPhoto(question), question.label).toBeUndefined()
  })

  it("leave landmark rounds their own photo", () => {
    for (const question of of(QuestionType.LANDMARK)) expect(revealPhoto(question), question.id).toBeUndefined()
  })
})
