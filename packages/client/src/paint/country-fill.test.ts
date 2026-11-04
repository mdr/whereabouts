import { describe, expect, it } from "vite-plus/test"
import bordersJson from "@whereabouts/shared/borders.json"
import outlinesJson from "@whereabouts/shared/outlines.json"
import { Borders } from "@whereabouts/shared/borders"
import { CATALOGUE, isFlagQuestion, outlinesFrom } from "@whereabouts/shared/catalogue/catalogue"
import { greatCircleDistance, type LatLon } from "@whereabouts/shared/geo"
import { FILL_DENSITY } from "@whereabouts/shared/paint/fill"
import { PaintLayer, resolutionForTolerance } from "@whereabouts/shared/paint/paint"
import { answerCentre, type FlagQuestion } from "@whereabouts/shared/questions"
import { scoreAnswer, scoredAnswer } from "@whereabouts/shared/scoring/regions"
import { DEFAULT_KERNEL, buildDistribution } from "@whereabouts/shared/scoring/scoring"
import { CountryFiller } from "./country-fill"

const flags = CATALOGUE.filter(isFlagQuestion)
const outlines = outlinesFrom(outlinesJson)
const filler = new CountryFiller(new Borders(bordersJson, flags), outlines)
const flag = (code: string): FlagQuestion => flags.find((question) => question.clue.flag === code)!

/** The country's flag round, scored as if painted with only what the Fill tool fills at `point`. */
const scoreFilledAt = (code: string, point: LatLon): number => {
  const answer = scoredAnswer(flag(code).answer, outlines)
  const resolution = resolutionForTolerance(answer.tolerance)
  const target = filler.targetAt(point, 0)!
  const layer = new PaintLayer(resolution)
  layer.addCoat(target.cells(resolution), FILL_DENSITY)
  return scoreAnswer(buildDistribution(layer.toCells(), 0.05), answer, DEFAULT_KERNEL).score
}

describe("CountryFiller", () => {
  it("fills the country under the pointer, so filling the right one scores near perfect", () => {
    expect(filler.targetAt({ lat: 48.85, lon: 2.35 }, 0)?.id).toBe("fr")
    expect(scoreFilledAt("fr", { lat: 48.85, lon: 2.35 })).toBeGreaterThan(990)
    expect(scoreFilledAt("br", { lat: -15.8, lon: -47.9 })).toBeGreaterThan(990)
  })

  it("fills nothing at sea", () => {
    expect(filler.targetAt({ lat: 0, lon: -30 }, 50)).toBeUndefined()
  })

  it("takes a small country within reach of the pointer, and not beyond it", () => {
    const tuvalu = answerCentre(flag("tv").answer)
    const offshore = { lat: tuvalu.lat + 0.3, lon: tuvalu.lon }
    expect(filler.targetAt(offshore, 50)?.id).toBe("tv")
    expect(filler.targetAt(offshore, 5)).toBeUndefined()
  })

  it("outlines a country with no land of its own as a ring of its reach around its answer", () => {
    const monaco = flag("mc")
    const outline = filler.outline(monaco)
    expect(outline.coordinates).toHaveLength(1)
    const ring = outline.coordinates[0]![0]!
    expect(ring.length).toBeGreaterThan(8)
    for (const [lon, lat] of ring)
      expect(greatCircleDistance({ lat: lat!, lon: lon! }, answerCentre(monaco.answer))).toBeCloseTo(15, 0)
  })

  it("names the country the same wherever it is clicked, so a second click takes the fill off", () => {
    expect(filler.targetAt({ lat: 45.76, lon: 4.84 }, 0)?.id).toBe(filler.targetAt({ lat: 48.85, lon: 2.35 }, 0)?.id)
  })
})
