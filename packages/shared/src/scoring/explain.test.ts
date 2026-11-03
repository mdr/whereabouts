import { describe, expect, it } from "vite-plus/test"
import { cellArea, cellToLatLng, gridDisk, type H3Cell, h3Resolution, latLngToCell } from "../h3.ts"
import outlinesJson from "../../outlines.json" with { type: "json" }
import { explainPoint, isHedge, type PointExplanation } from "./explain.ts"
import { resolutionForTolerance } from "../paint/paint.ts"
import { regionCells, regionMisfit, scoreArea, scoredAnswer, type Area, type RegionMisfit } from "./regions.ts"
import { CATALOGUE, outlinesFrom } from "../catalogue/catalogue.ts"
import { AnswerType } from "../questions.ts"
import { buildDistribution, scoreDistribution, type Distribution, type ScoreBreakdown } from "./scoring.ts"

const coat = (cells: H3Cell[]): Distribution =>
  buildDistribution(
    cells.map((cell) => {
      const [lat, lon] = cellToLatLng(cell)
      return { lat, lon, intensity: 1, area: cellArea(cell), h3: cell }
    }),
    0.05
  )

describe("explaining a place's score", () => {
  const answer = { lat: 48.8584, lon: 2.2945 }
  const tolerance = 150
  const resolution = resolutionForTolerance(tolerance)
  const explain = (
    lat: number,
    lon: number,
    cellResolution: number,
    rings: number
  ): { scored: ScoreBreakdown; explained: PointExplanation } => {
    const d = coat(gridDisk(latLngToCell(lat, lon, h3Resolution(cellResolution)), rings))
    const scored = scoreDistribution(d, answer, tolerance)
    const explained = explainPoint(d, answer, tolerance, scored.A, scored.B)
    return { scored, explained }
  }

  it("a tight guess on the answer is tight and right on it", () => {
    const { scored, explained } = explain(answer.lat, answer.lon, resolution, 1)
    expect(explained.best - scored.score).toBeLessThan(25)
    expect(explained.best).toBeGreaterThan(940)
  })

  it("a tight miss is tight but off", () => {
    const { scored, explained } = explain(answer.lat + 2.7, answer.lon, resolution, 1)
    expect(explained.best).toBeGreaterThan(930)
    expect(explained.miss).toBeGreaterThan(250)
    expect(explained.miss).toBeLessThan(350)
    expect(explained.best - scored.score).toBeGreaterThan(150)
  })

  it("a broad guess on the answer is spread", () => {
    const { scored, explained } = explain(answer.lat, answer.lon, resolution - 2, 6)
    expect(explained.best).toBeLessThan(780)
    expect(explained.best - scored.score).toBeLessThan(25)
  })
})

describe("a hedge", () => {
  const TOLERANCE = 100
  const explained = (best: number, extra: Partial<PointExplanation> = {}): PointExplanation => ({
    best,
    spot: { lat: 0, lon: 0 },
    miss: 0,
    nearShare: 1,
    ...extra
  })

  const hedge = { miss: 1000, nearShare: 0.2 }
  it.each([
    ["some paint near, most far, and it cost", explained(800, hedge), 600, true],
    ["too little paint near", explained(800, { ...hedge, nearShare: 0.1 }), 600, false],
    ["the strongest paint within four tolerances", explained(800, { ...hedge, miss: 400 }), 600, false],
    ["spreading cost under 25 points", explained(800, hedge), 780, false]
  ])("hedged or not: %s", (_, e, score, hedged) => {
    expect(isHedge(e, score, TOLERANCE)).toBe(hedged)
  })
})

describe("explaining a country's score", () => {
  const outlines = outlinesFrom(outlinesJson)
  const areaOf = (id: string): Area => {
    const a = scoredAnswer(CATALOGUE.find((question) => question.id === id)!.answer, outlines)
    if (a.type !== AnswerType.AREA) throw new Error(`${id} is not painted whole`)
    return a
  }
  const france = areaOf("france-region")
  const resolution = resolutionForTolerance(france.tolerance)
  const cells = regionCells(france, resolution)
  const misfit = (cells: H3Cell[]): RegionMisfit => regionMisfit(coat(cells), france)

  it("an exact paint is on the country, with nothing off it", () => {
    expect(scoreArea(coat(cells), france).score).toBeGreaterThan(985)
    const fit = misfit(cells)
    expect(fit.precision).toBeCloseTo(1)
    expect(fit.off).toBeUndefined()
  })

  it("finds paint spilled over a border, and a neighbour painted instead, to the north-east", () => {
    const germany = regionCells(areaOf("germany-region"), resolution)
    const spilled = misfit([...cells, ...germany])
    expect(spilled.precision).toBeLessThan(0.75)
    expect(spilled.off?.bearing).toBeGreaterThan(22.5)
    expect(spilled.off?.bearing).toBeLessThan(67.5)
    const instead = misfit(germany)
    expect(instead.precision).toBeLessThan(0.1)
    expect(instead.off?.distance).toBeLessThan(5 * france.tolerance)
  })
})
