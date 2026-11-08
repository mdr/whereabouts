import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE } from "./catalogue.ts"
import { AnswerType, QuestionType, clueFlag, promptOf, type PartOfCountryQuestion } from "../questions.ts"

const PARTS = CATALOGUE.filter(
  (question): question is PartOfCountryQuestion => question.type === QuestionType.PART_OF_COUNTRY
)

describe("parts of countries", () => {
  it("paint the big ones whole and ask the rest as a point", () => {
    expect(PARTS).toHaveLength(39)
    expect(
      PARTS.filter((question) => question.answer.type === AnswerType.AREA)
        .map((question) => question.label)
        .sort()
    ).toEqual([
      "England",
      "Falkland Islands",
      "French Guiana",
      "Greenland",
      "New Caledonia",
      "Northern Ireland",
      "Sardinia",
      "Scotland",
      "Sicily",
      "Svalbard",
      "Tasmania",
      "Wales"
    ])
  })

  it("ask in the form their answer takes", () => {
    for (const question of PARTS)
      expect(promptOf(question), question.id).toMatch(
        question.answer.type === AnswerType.AREA ? /^Paint the whole of / : /^Where (is|are) .+\?$/
      )
    expect(promptOf(PARTS.find((question) => question.label === "Azores")!)).toBe("Where are the Azores?")
  })

  it("say whose they are with the flag of a country the game knows", () => {
    const flags = new Set(CATALOGUE.map((question) => clueFlag(question.clue)))
    for (const question of PARTS) {
      expect(question.partOf.status, question.id).toMatch(/^(a|an|part) /)
      expect(flags.has(question.partOf.flag), question.id).toBe(true)
    }
  })

  it("are asked only here, not also as an island or a place name", () => {
    const labels = new Set(PARTS.map((question) => question.label))
    const elsewhere = CATALOGUE.filter(
      (question) =>
        (question.type === QuestionType.FEATURE || question.type === QuestionType.PLACE) && labels.has(question.label)
    )
    expect(elsewhere.map((question) => question.label)).toEqual([])
  })
})
