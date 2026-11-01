import { describe, expect, it } from "vite-plus/test"
import { cellArea, cellToLatLng, gridDisk, latLngToCell } from "../h3.ts"
import outlinesJson from "../../outlines.json" with { type: "json" }
import { CATALOGUE, isFlagQuestion, outlinesFrom } from "./catalogue.ts"
import { resolutionForTolerance } from "../paint/paint.ts"
import { buildDistribution, scoreDistribution } from "../scoring/scoring.ts"
import { AnswerType, FLAG_AREA_PROMPT, FLAG_POINT_PROMPT, promptOf } from "../questions.ts"

const FLAGS = CATALOGUE.filter(isFlagQuestion)
const OUTLINES = outlinesFrom(outlinesJson)
const flag = (code: string) => FLAGS.find((question) => question.clue.flag === code)!

describe("flag questions", () => {
  it("are one per country, well formed", () => {
    expect(FLAGS.length).toBeGreaterThan(190)
    expect(new Set(FLAGS.map((question) => question.clue.flag)).size).toBe(FLAGS.length)
    for (const question of FLAGS) {
      expect(question.label.length, question.id).toBeGreaterThan(0)
      expect(question.wiki.length, question.id).toBeGreaterThan(0)
      if (question.answer.type === AnswerType.AREA)
        expect(OUTLINES.has(question.answer.outline), question.id).toBe(true)
      else expect(question.answer.tolerance, question.id).toBeGreaterThanOrEqual(15)
    }
  })

  it("paint big countries whole and ask small, disputed and far-flung ones as a point", () => {
    for (const code of ["de", "br", "ca", "au", "ie", "lb", "bs", "vu"])
      expect(flag(code).answer.type, code).toBe(AnswerType.AREA)
    for (const code of ["va", "mc", "sg", "lu", "mt", "ki", "in", "cn", "ru", "us", "ua", "cy"])
      expect(flag(code).answer.type, code).toBe(AnswerType.POINT)
  })

  it("paint a country with the same outline as its own round", () => {
    const de = flag("de")
    const germany = CATALOGUE.find((question) => question.id === "germany-region")!
    expect(de.answer).toEqual(germany.answer)
  })

  it("ask with the flag in place of the name", () => {
    expect(promptOf(flag("de"))).toBe(FLAG_AREA_PROMPT)
    expect(promptOf(flag("mc"))).toBe(FLAG_POINT_PROMPT)
    expect(flag("mc").label).toBe("Monaco")
    expect(flag("mc").answer.tolerance).toBe(15)
  })

  it("score a tight paint on a point country's answer highly, and a far one low", () => {
    for (const code of ["lu", "sg", "va", "in"]) {
      const { answer } = flag(code)
      if (answer.type !== AnswerType.POINT) throw new Error(`${code} is painted whole`)
      const { at, tolerance } = answer
      const lat: number = at.lat
      const res = resolutionForTolerance(tolerance)
      const blob = (lat: number, lon: number) =>
        buildDistribution(
          gridDisk(latLngToCell(lat, lon, res), 2).map((cell) => {
            const [cellLat, cellLon] = cellToLatLng(cell)
            return { lat: cellLat, lon: cellLon, intensity: 1, area: cellArea(cell), h3: cell }
          }),
          0.05
        )
      expect(scoreDistribution(blob(lat, at.lon), at, tolerance).score, code).toBeGreaterThan(900)
      expect(scoreDistribution(blob(-lat, at.lon + 180), at, tolerance).score, code).toBeLessThan(320)
    }
  })
})
