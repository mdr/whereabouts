import { describe, expect, it } from "vite-plus/test"
import { cellArea, cellToLatLng, gridDisk, type H3Cell, h3Res, latLngToCell, UNITS } from "./h3.ts"
import outlinesJson from "../outlines.json" with { type: "json" }
import { describePoint, describeRegion, explainPoint } from "./explain.ts"
import { resolutionForTolerance } from "./paint.ts"
import { regionCells, regionMisfit, scoreArea, scoredAnswer, type Area } from "./regions.ts"
import { CATALOGUE, outlinesFrom } from "./catalogue.ts"
import { AnswerType } from "./questions.ts"
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
    return { s, e, text: describePoint(e, s.score, tol) }
  }

  it("a tight guess on the answer is tight and right on it", () => {
    const { s, e, text } = explain(answer.lat, answer.lon, res, 1)
    expect(e.best - s.score).toBeLessThan(25)
    expect(text).toBe("Spot on.")
  })

  it("a tight miss is told it was off", () => {
    const { s, e, text } = explain(answer.lat + 2.7, answer.lon, res, 1)
    expect(e.best).toBeGreaterThan(930)
    expect(e.miss).toBeGreaterThan(250)
    expect(e.miss).toBeLessThan(350)
    expect(e.best - s.score).toBeGreaterThan(150)
    expect(text).toBe("Some way off.")
  })

  it("a broad guess on the answer is is told it was spread", () => {
    const { e, text } = explain(answer.lat, answer.lon, res - 2, 6)
    expect(e.best).toBeLessThan(780)
    expect(text).toBe("Right area, but very spread out.")
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
  const label = CATALOGUE.find((q) => q.id === "france-region")!.label
  const res = resolutionForTolerance(france.tolerance)
  const cells = regionCells(france, res)
  const say = (cs: H3Cell[]) => describeRegion(regionMisfit(coat(cs), france), label, france.tolerance)

  it("an exact paint is a close match", () => {
    expect(scoreArea(coat(cells), france).score).toBeGreaterThan(985)
    expect(say(cells)).toBe("A good match.")
  })

  it("names the side left bare", () => {
    expect(say(cells.filter((h) => cellToLatLng(h)[1] < france.centre.lon))).toBe("You missed a lot of the east.")
  })

  it("names the border paint spilled over, and a neighbour painted instead", () => {
    const germany = regionCells(areaOf("germany-region"), res)
    expect(say([...cells, ...germany])).toBe("A lot of your paint went over the north-east border.")
    expect(say(germany)).toBe(`Your paint was just north-east of ${label}.`)
  })
})
