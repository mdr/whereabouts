import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE } from "./catalogue.ts"
import { AnswerType, FeatureType, QuestionType, Surface, promptOf, type FeatureQuestion } from "../questions.ts"

const FEATURES = CATALOGUE.filter((question): question is FeatureQuestion => question.type === QuestionType.FEATURE)
const STATES = CATALOGUE.filter((question) => question.type === QuestionType.STATE)
const COUNTRIES = CATALOGUE.filter((question) => question.type === QuestionType.COUNTRY)
const of = (feature: FeatureType) => FEATURES.filter((question) => question.feature === feature)

describe("islands, lakes, seas and US states", () => {
  it("are well formed", () => {
    for (const question of [...FEATURES, ...STATES]) {
      expect(question.label.length, question.id).toBeGreaterThan(0)
      expect(question.wiki.length, question.id).toBeGreaterThan(0)
      expect(question.answer.tolerance, question.id).toBeGreaterThanOrEqual(5)
      if (question.answer.type === AnswerType.AREA)
        expect(promptOf(question), question.id).toMatch(/^Paint the whole of /)
    }
  })

  it("leave out islands already asked as a country", () => {
    expect(of(FeatureType.ISLAND)).toHaveLength(20)
    const countries = new Set(COUNTRIES.map((question) => question.label))
    for (const question of of(FeatureType.ISLAND)) expect(countries.has(question.label), question.label).toBe(false)
    for (const name of ["Madagascar", "Cuba", "Iceland", "Sri Lanka", "Great Britain", "Ireland"])
      expect(
        of(FeatureType.ISLAND).some((question) => question.label === name),
        name
      ).toBe(false)
  })

  it("have the lakes big enough to paint, and the nearly closed seas", () => {
    expect(of(FeatureType.LAKE).map((question) => question.label)).toContain("Lake Baikal")
    expect(of(FeatureType.LAKE)).toHaveLength(15)
    expect(of(FeatureType.SEA).map((question) => question.label)).toEqual(
      expect.arrayContaining(["Mediterranean Sea", "Black Sea", "Caspian Sea", "Red Sea", "Baltic Sea"])
    )
    expect(of(FeatureType.SEA)).toHaveLength(7)
  })

  it("paint lakes and seas on water, islands on land", () => {
    for (const question of [...of(FeatureType.LAKE), ...of(FeatureType.SEA)])
      expect(question.answer.surface, question.id).toBe(Surface.WATER)
    for (const question of of(FeatureType.ISLAND)) expect(question.answer.surface, question.id).toBe(Surface.LAND)
  })

  it("have all 50 states, the two smallest asked as a point, and Georgia not mistaken for the country", () => {
    expect(STATES).toHaveLength(50)
    expect(
      STATES.filter((question) => question.answer.type === AnswerType.POINT).map((question) => question.label)
    ).toEqual(["Delaware", "Rhode Island"])
    const georgia = STATES.find((question) => question.label.startsWith("Georgia"))!
    expect(COUNTRIES.some((question) => question.label === georgia.label)).toBe(false)
    expect(promptOf(georgia)).toContain("US state")
  })
})
