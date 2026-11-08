import { describe, expect, it } from "vite-plus/test"
import islandsJson from "@whereabouts/shared/islands.json"
import outlinesJson from "@whereabouts/shared/outlines.json"
import { CATALOGUE, outlinesFrom } from "@whereabouts/shared/catalogue/catalogue"
import type { LatLon, Polygon } from "@whereabouts/shared/geo"
import { FILL_DENSITY } from "@whereabouts/shared/paint/fill"
import { PaintLayer, resolutionForTolerance } from "@whereabouts/shared/paint/paint"
import { FeatureType, QuestionType, type FeatureQuestion } from "@whereabouts/shared/questions"
import { scoreAnswer, scoredAnswer } from "@whereabouts/shared/scoring/regions"
import { DEFAULT_KERNEL, buildDistribution } from "@whereabouts/shared/scoring/scoring"
import { IslandFiller } from "./island-fill"

const filler = new IslandFiller(islandsJson as Polygon[])
const outlines = outlinesFrom(outlinesJson)
const island = (label: string): FeatureQuestion =>
  CATALOGUE.find(
    (question): question is FeatureQuestion =>
      question.type === QuestionType.FEATURE && question.feature === FeatureType.ISLAND && question.label === label
  )!

const BORNEO: LatLon = { lat: 0.9, lon: 114 }
const BAFFIN_ISLAND: LatLon = { lat: 68, lon: -72 }

/** The island's round, scored as if painted with only what the Fill tool fills at `point`. */
const scoreFilledAt = (label: string, point: LatLon): number => {
  const answer = scoredAnswer(island(label).answer, outlines)
  const resolution = resolutionForTolerance(answer.tolerance)
  const layer = new PaintLayer(resolution)
  layer.addCoat(filler.targetAt(point)!.cells(resolution), FILL_DENSITY)
  return scoreAnswer(buildDistribution(layer.toCells(), 0.05), answer, DEFAULT_KERNEL).score
}

describe("IslandFiller", () => {
  it("fills the island under the pointer, so filling the right one scores near perfect", () => {
    expect(scoreFilledAt("Borneo", BORNEO)).toBeGreaterThan(990)
    expect(scoreFilledAt("Baffin Island", BAFFIN_ISLAND)).toBeGreaterThan(990)
  })

  it("fills nothing at sea or on a continent", () => {
    expect(filler.targetAt({ lat: 0, lon: -30 })).toBeUndefined()
    expect(filler.targetAt({ lat: 50, lon: 10 })).toBeUndefined()
  })

  it("names an island the same wherever it is clicked, and apart from the others", () => {
    const borneo = filler.targetAt(BORNEO)?.id
    expect(filler.targetAt({ lat: 3, lon: 116 })?.id).toBe(borneo)
    expect(filler.targetAt(BAFFIN_ISLAND)?.id).not.toBe(borneo)
  })
})
