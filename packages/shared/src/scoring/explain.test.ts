import { describe, expect, it } from "vite-plus/test"
import { cellArea, cellToLatLng, gridDisk, type H3Cell, h3Res, latLngToCell, UNITS } from "../h3.ts"
import outlinesJson from "../../outlines.json" with { type: "json" }
import { explainPoint, isHedge, type PointExplanation } from "./explain.ts"
import { resolutionForTolerance } from "../paint/paint.ts"
import { regionCells, regionMisfit, scoreArea, scoredAnswer, type Area } from "./regions.ts"
import { CATALOGUE, outlinesFrom } from "../catalogue/catalogue.ts"
import { AnswerType } from "../questions.ts"
import { buildDistribution, scoreDistribution } from "./scoring.ts"

const coat = (cells: H3Cell[]) =>
  buildDistribution(
    cells.map((h) => {
      const [lat, lon] = cellToLatLng(h)
      return { lat, lon, intensity: 1, area: cellArea(h, UNITS.km2), h3: h }
    }),
    0.05
  )

describe("explaining a place's score", () => {
  const answer = { lat: 48.8584, lon: 2.2945 }
  const tol = 150
  const res = resolutionForTolerance(tol)
  const explain = (lat: number, lon: number, r: number, k: number) => {
    const d = coat(gridDisk(latLngToCell(lat, lon, h3Res(r)), k))
    const s = scoreDistribution(d, answer, tol)
    const e = explainPoint(d, answer, tol, s.A, s.B)
    return { s, e }
  }

  it("a tight guess on the answer is tight and right on it", () => {
    const { s, e } = explain(answer.lat, answer.lon, res, 1)
    expect(e.best - s.score).toBeLessThan(25)
    expect(e.best).toBeGreaterThan(940)
  })

  it("a tight miss is tight but off", () => {
    const { s, e } = explain(answer.lat + 2.7, answer.lon, res, 1)
    expect(e.best).toBeGreaterThan(930)
    expect(e.miss).toBeGreaterThan(250)
    expect(e.miss).toBeLessThan(350)
    expect(e.best - s.score).toBeGreaterThan(150)
  })

  it("a broad guess on the answer is spread", () => {
    const { s, e } = explain(answer.lat, answer.lon, res - 2, 6)
    expect(e.best).toBeLessThan(780)
    expect(e.best - s.score).toBeLessThan(25)
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
    const a = scoredAnswer(CATALOGUE.find((q) => q.id === id)!.answer, outlines)
    if (a.type !== AnswerType.AREA) throw new Error(`${id} is not painted whole`)
    return a
  }
  const france = areaOf("france-region")
  const res = resolutionForTolerance(france.tolerance)
  const cells = regionCells(france, res)
  const misfit = (cs: H3Cell[]) => regionMisfit(coat(cs), france)

  it("an exact paint is on the country, with nothing off it", () => {
    expect(scoreArea(coat(cells), france).score).toBeGreaterThan(985)
    const m = misfit(cells)
    expect(m.precision).toBeCloseTo(1)
    expect(m.off).toBeUndefined()
  })

  it("finds paint spilled over a border, and a neighbour painted instead, to the north-east", () => {
    const germany = regionCells(areaOf("germany-region"), res)
    const spilled = misfit([...cells, ...germany])
    expect(spilled.precision).toBeLessThan(0.75)
    expect(spilled.off?.bearing).toBeGreaterThan(22.5)
    expect(spilled.off?.bearing).toBeLessThan(67.5)
    const instead = misfit(germany)
    expect(instead.precision).toBeLessThan(0.1)
    expect(instead.off?.distance).toBeLessThan(5 * france.tolerance)
  })
})
