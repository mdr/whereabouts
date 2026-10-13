import { describe, expect, it } from "vitest"
import featuresJson from "../features.json" with { type: "json" }
import regionsJson from "../regions.json" with { type: "json" }
import { featureFrom, type RegionData, regionFrom } from "./regions.ts"
import { type QuestionData } from "./questions.ts"

const FEATURES = (featuresJson as (QuestionData | RegionData)[]).map(featureFrom)
const COUNTRIES = (regionsJson as RegionData[]).map(regionFrom)
const of = (topic: string) => FEATURES.filter((q) => q.topic === topic)

describe("islands, lakes, seas and US states", () => {
  it("are well formed, each with its own id", () => {
    expect(new Set(FEATURES.map((q) => q.id)).size).toBe(FEATURES.length)
    for (const q of FEATURES) {
      expect(q.label.length, q.id).toBeGreaterThan(0)
      expect(q.wiki?.length, q.id).toBeGreaterThan(0)
      expect(q.toleranceKm, q.id).toBeGreaterThanOrEqual(5)
      if (q.kind === "region") {
        expect(q.prompt, q.id).toMatch(/^Paint the whole of /)
        expect(q.outline.length, q.id).toBeGreaterThan(0)
      }
    }
  })

  it("leave out islands already asked as a country", () => {
    expect(of("island")).toHaveLength(20)
    const countries = new Set(COUNTRIES.map((q) => q.label))
    for (const q of of("island")) expect(countries.has(q.label), q.label).toBe(false)
    for (const name of ["Madagascar", "Cuba", "Iceland", "Sri Lanka", "Great Britain", "Ireland"])
      expect(
        of("island").some((q) => q.label === name),
        name
      ).toBe(false)
  })

  it("have the lakes big enough to paint, and the nearly closed seas", () => {
    expect(of("lake").map((q) => q.label)).toContain("Lake Baikal")
    expect(of("lake")).toHaveLength(15)
    expect(of("sea").map((q) => q.label)).toEqual(
      expect.arrayContaining(["Mediterranean Sea", "Black Sea", "Caspian Sea", "Red Sea", "Baltic Sea"])
    )
    expect(of("sea")).toHaveLength(7)
    expect(
      of("lake")
        .concat(of("sea"))
        .every((q) => q.kind === "region")
    ).toBe(true)
  })

  it("have all 50 states, the two smallest asked as a point, and Georgia not mistaken for the country", () => {
    const states = of("state")
    expect(states).toHaveLength(50)
    expect(states.filter((q) => q.kind !== "region").map((q) => q.label)).toEqual(["Delaware", "Rhode Island"])
    const georgia = states.find((q) => q.label.startsWith("Georgia"))!
    expect(COUNTRIES.some((q) => q.label === georgia.label)).toBe(false)
    expect(georgia.prompt).toContain("US state")
  })
})
