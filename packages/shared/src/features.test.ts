import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE } from "./catalogue.ts"
import { AnswerType, FeatureType, QuestionType, Surface, promptOf, type FeatureQuestion } from "./questions.ts"

const FEATURES = CATALOGUE.filter((q): q is FeatureQuestion => q.type === QuestionType.FEATURE)
const STATES = CATALOGUE.filter((q) => q.type === QuestionType.STATE)
const COUNTRIES = CATALOGUE.filter((q) => q.type === QuestionType.COUNTRY)
const of = (feature: FeatureType) => FEATURES.filter((q) => q.feature === feature)

describe("islands, lakes, seas and US states", () => {
  it("are well formed", () => {
    for (const q of [...FEATURES, ...STATES]) {
      expect(q.label.length, q.id).toBeGreaterThan(0)
      expect(q.wiki.length, q.id).toBeGreaterThan(0)
      expect(q.answer.tolerance, q.id).toBeGreaterThanOrEqual(5)
      if (q.answer.type === AnswerType.AREA) expect(promptOf(q), q.id).toMatch(/^Paint the whole of /)
    }
  })

  it("leave out islands already asked as a country", () => {
    expect(of(FeatureType.ISLAND)).toHaveLength(20)
    const countries = new Set(COUNTRIES.map((q) => q.label))
    for (const q of of(FeatureType.ISLAND)) expect(countries.has(q.label), q.label).toBe(false)
    for (const name of ["Madagascar", "Cuba", "Iceland", "Sri Lanka", "Great Britain", "Ireland"])
      expect(
        of(FeatureType.ISLAND).some((q) => q.label === name),
        name
      ).toBe(false)
  })

  it("have the lakes big enough to paint, and the nearly closed seas", () => {
    expect(of(FeatureType.LAKE).map((q) => q.label)).toContain("Lake Baikal")
    expect(of(FeatureType.LAKE)).toHaveLength(15)
    expect(of(FeatureType.SEA).map((q) => q.label)).toEqual(
      expect.arrayContaining(["Mediterranean Sea", "Black Sea", "Caspian Sea", "Red Sea", "Baltic Sea"])
    )
    expect(of(FeatureType.SEA)).toHaveLength(7)
  })

  it("paint lakes and seas on water, islands on land", () => {
    for (const q of [...of(FeatureType.LAKE), ...of(FeatureType.SEA)])
      expect(q.answer.surface, q.id).toBe(Surface.WATER)
    for (const q of of(FeatureType.ISLAND)) expect(q.answer.surface, q.id).toBe(Surface.LAND)
  })

  it("have all 50 states, the two smallest asked as a point, and Georgia not mistaken for the country", () => {
    expect(STATES).toHaveLength(50)
    expect(STATES.filter((q) => q.answer.type === AnswerType.POINT).map((q) => q.label)).toEqual([
      "Delaware",
      "Rhode Island"
    ])
    const georgia = STATES.find((q) => q.label.startsWith("Georgia"))!
    expect(COUNTRIES.some((q) => q.label === georgia.label)).toBe(false)
    expect(promptOf(georgia)).toContain("US state")
  })
})
