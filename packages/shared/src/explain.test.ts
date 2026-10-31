import { describe, expect, it } from "vite-plus/test"
import { cellArea, cellToLatLng, gridDisk, type H3Cell, h3Res, latLngToCell, UNITS } from "./h3.ts"
import outlinesJson from "../outlines.json" with { type: "json" }
import { describePoint, describeRegion, explainPoint, isHedge, type PointExplanation } from "./explain.ts"
import { resolutionForTolerance } from "./paint.ts"
import { regionCells, regionMisfit, scoreArea, scoredAnswer, type Area, type RegionMisfit } from "./regions.ts"
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

describe("the words for a place's score", () => {
  const TOLERANCE = 100
  const explained = (best: number, extra: Partial<PointExplanation> = {}): PointExplanation => ({
    best,
    spot: { lat: 0, lon: 0 },
    miss: 0,
    nearShare: 1,
    ...extra
  })

  it.each([
    // best, score: spread is 1000 - best, the distance best - score
    [990, 980, "Spot on."],
    [990, 900, "Close, but slightly off."],
    [990, 700, "Some way off."],
    [990, 500, "A long way off."],
    [900, 890, "Right area, but a bit spread out."],
    [700, 650, "Close, but very spread out."],
    [700, 400, "Some way off, and very spread out."],
    [700, 200, "A long way off, and very spread out."],
    // A score above the best found counts as the best.
    [500, 600, "Right area, but very spread out."]
  ])("best %i, scored %i: %s", (best, score, sentence) => {
    expect(describePoint(explained(best), score, TOLERANCE)).toBe(sentence)
  })

  const hedge = { miss: 1000, nearShare: 0.2 }
  it.each([
    ["some paint near, most far, and it cost", explained(800, hedge), 600, true],
    ["too little paint near", explained(800, { ...hedge, nearShare: 0.1 }), 600, false],
    ["the strongest paint within four tolerances", explained(800, { ...hedge, miss: 400 }), 600, false],
    ["spreading cost under 25 points", explained(800, hedge), 780, false]
  ])("hedged or not: %s", (_, e, score, hedged) => {
    expect(isHedge(e, score, TOLERANCE)).toBe(hedged)
    if (hedged)
      expect(describePoint(e, score, TOLERANCE)).toBe("Some of your paint was on it, but most was somewhere else.")
  })
})

describe("the words for a country's score", () => {
  // A country's radius is five tolerances: 500 km here.
  const say = (m: Partial<RegionMisfit>, edge?: string) =>
    describeRegion({ coverage: 1, precision: 1, off: undefined, bare: undefined, ...m }, "Ruritania", 100, edge)

  it.each([
    ["off it, round about", { precision: 0.05 }, "Your paint was around Ruritania, but not on it."],
    [
      "just off one side",
      { precision: 0.05, off: { bearing: 0, distance: 400 } },
      "Your paint was just north of Ruritania."
    ],
    ["well off", { precision: 0.05, off: { bearing: 90, distance: 1500 } }, "Your paint was well east of Ruritania."],
    [
      "a long way off",
      { precision: 0.05, off: { bearing: 350, distance: 3000 } },
      "Your paint was a long way north of Ruritania."
    ],
    ["over the border all round", { precision: 0.5 }, "A lot of your paint went over the border all round."],
    [
      "over one border",
      { precision: 0.8, off: { bearing: 225, distance: 400 } },
      "Some of your paint went over the south-west border."
    ],
    [
      "well to one side",
      { precision: 0.3, off: { bearing: 90, distance: 1500 } },
      "Most of your paint was well to the east."
    ],
    ["one side bare", { coverage: 0.3, bare: { bearing: 180 } }, "You missed most of the south."],
    ["patchy", { coverage: 0.8 }, "You missed some of Ruritania."],
    [
      "the bigger fault first",
      { precision: 0.85, coverage: 0.6 },
      "You missed a lot of Ruritania. Some of your paint went over the border all round."
    ],
    ["near enough", { precision: 0.95, coverage: 0.95 }, "A good match."]
  ])("%s", (_, m, sentence) => {
    expect(say(m as Partial<RegionMisfit>)).toBe(sentence)
  })

  it("names the edge it is given", () => {
    expect(say({ precision: 0.5 }, "shore")).toBe("A lot of your paint went over the shore all round.")
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
