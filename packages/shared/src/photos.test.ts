import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE } from "./catalogue.ts"
import { REVEAL_PHOTOS, revealPhoto } from "./photos.ts"
import { QuestionType, clueImage } from "./questions.ts"

const of = (...types: QuestionType[]) => CATALOGUE.filter((q) => types.includes(q.type))

describe("the reveal photos", () => {
  const answers = new Set<string>(CATALOGUE.filter((q) => q.type !== QuestionType.FLAG).map((q) => q.wiki))

  it("are for answers the game asks about", () => {
    for (const wiki of Object.keys(REVEAL_PHOTOS)) expect(answers.has(wiki), wiki).toBe(true)
  })

  it("are JPEG files, none of them a photo round's own photo", () => {
    const asked = new Set(CATALOGUE.map((q) => clueImage(q.clue)))
    for (const [wiki, file] of Object.entries(REVEAL_PHOTOS)) {
      expect(file, wiki).toMatch(/\.jpe?g$/i)
      expect(file, wiki).not.toMatch(/^File:/)
      expect(asked.has(file), `${wiki}: ${file}`).toBe(false)
    }
  })

  it("give every place-name, island, lake, sea and US state round a photo", () => {
    for (const q of of(QuestionType.PLACE, QuestionType.FEATURE, QuestionType.STATE))
      expect(revealPhoto(q), q.id).toBeDefined()
  })

  it("show no photo on a country or flag round, which shows the flag", () => {
    for (const q of of(QuestionType.COUNTRY, QuestionType.FLAG)) expect(revealPhoto(q), q.label).toBeUndefined()
  })

  it("leave landmark rounds their own photo", () => {
    for (const q of of(QuestionType.LANDMARK)) expect(revealPhoto(q), q.id).toBeUndefined()
  })
})
