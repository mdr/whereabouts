import { describe, expect, it } from "vite-plus/test"
import {
  cellAreaKm2,
  cellToChildren,
  cellToLatLng,
  getRes0Cells,
  gridDisk,
  type H3Cell,
  h3Res,
  latLngToCell
} from "../h3.ts"
import outlinesJson from "../../outlines.json" with { type: "json" }
import { resolutionForTolerance } from "../paint/paint.ts"
import { CATALOGUE, outlinesFrom } from "../catalogue/catalogue.ts"
import { AnswerType, QuestionType, promptOf, type PointAnswer } from "../questions.ts"
import {
  roundsOverlap,
  regionCells,
  regionFit,
  regionScoringRes,
  scoreAnswer,
  scoreArea,
  scoredAnswer,
  SHAPE_WEIGHT,
  type Area
} from "./regions.ts"
import {
  DEFAULT_KERNEL,
  PASS_SCORE,
  buildDistribution,
  coarsenDistribution,
  scoreDistribution,
  type Distribution
} from "./scoring.ts"

const OUTLINES = outlinesFrom(outlinesJson)
const COUNTRIES = CATALOGUE.filter((q) => q.type === QuestionType.COUNTRY)

/** A question's area, its outline looked up. */
function byId(id: string): Area {
  const a = scoredAnswer(CATALOGUE.find((q) => q.id === id)!.answer, OUTLINES)
  if (a.type !== AnswerType.AREA) throw new Error(`${id} is not painted whole`)
  return a
}

/** A question's point answer. */
function pointOf(wiki: string): PointAnswer {
  const { answer } = CATALOGUE.find((q) => q.wiki === wiki)!
  if (answer.type !== AnswerType.POINT) throw new Error(`${wiki} is painted whole`)
  return answer
}

/** An even coat of paint over `cells`, with the usual 5% world floor. */
function coat(cells: H3Cell[], floor = 0.05) {
  return buildDistribution(
    cells.map((h) => {
      const [lat, lon] = cellToLatLng(h)
      return { lat, lon, intensity: 1, area: cellAreaKm2(h), h3: h }
    }),
    floor
  )
}

/** Paint a region the way a player would: at the question's painting resolution. */
const paintRegion = (q: Area) => coat(regionCells(q, resolutionForTolerance(q.tolerance)))

describe("region questions", () => {
  it("are well formed", () => {
    for (const country of COUNTRIES) {
      const q = byId(country.id)
      expect(promptOf(country)).toMatch(/^Paint the whole of /)
      expect(q.tolerance).toBeGreaterThanOrEqual(10)
      expect(q.tolerance).toBeLessThanOrEqual(400)
      expect(q.polygons.length).toBeGreaterThan(0)
      for (const polygon of q.polygons) {
        for (const ring of polygon) {
          expect(ring.length).toBeGreaterThanOrEqual(4)
          expect(ring[0]).toEqual(ring.at(-1))
        }
      }
      expect(regionCells(q, regionScoringRes(q.tolerance)).length, country.id).toBeGreaterThan(10)
    }
  })

  it("painting the country as it is scores close to 1000", () => {
    // A spread of shapes and sizes: big, small, long, in two parts, and
    // islands. All 150 take too long for CI; pnpm calibrate paints every one.
    const sample = [
      "germany-region",
      "canada-region",
      "indonesia-region",
      "chile-region",
      "norway-region",
      "malaysia-region",
      "the-gambia-region",
      "lebanon-region",
      "solomon-islands-region",
      "new-zealand-region"
    ]
    for (const id of sample) {
      const q = byId(id)
      const { score } = scoreArea(paintRegion(q), q)
      expect(score, id).toBeGreaterThan(985)
    }
  })

  it("ranks the right country above a neighbour above one of its size far away", () => {
    const germany = byId("germany-region")
    const exact = scoreArea(paintRegion(germany), germany).score
    const poland = scoreArea(paintRegion(byId("poland-region")), germany).score
    const japan = scoreArea(paintRegion(byId("japan-region")), germany).score
    // A far bigger country, painted thinly: spreading wrong paint thinly is still wrong.
    const brazil = scoreArea(paintRegion(byId("brazil-region")), germany).score
    expect(exact).toBeGreaterThan(poland)
    expect(poland).toBeGreaterThan(250) // a near miss still beats a pass
    expect(poland).toBeLessThan(800)
    expect(japan).toBeLessThan(250) // a confident wrong answer is worse than passing
    expect(brazil).toBeGreaterThan(japan)
    expect(brazil).toBeLessThan(500)
  })

  it("reports coverage and precision", () => {
    const germany = byId("germany-region")
    const exact = regionFit(paintRegion(germany), germany)
    expect(exact.coverage).toBeGreaterThan(0.95)
    expect(exact.precision).toBeGreaterThan(0.95)
    const poland = regionFit(paintRegion(byId("poland-region")), germany)
    expect(poland.precision).toBeLessThan(0.1)
    expect(poland.coverage).toBeLessThan(0.1)
    // Germany and Poland together: all of Germany covered, about half the paint on it.
    const both = regionFit(
      coat([
        ...regionCells(germany, resolutionForTolerance(germany.tolerance)),
        ...regionCells(byId("poland-region"), resolutionForTolerance(germany.tolerance))
      ]),
      germany
    )
    expect(both.coverage).toBeGreaterThan(0.95)
    expect(both.precision).toBeGreaterThan(0.4)
    expect(both.precision).toBeLessThan(0.6)
  })
})

describe("shape and nearness", () => {
  const germany = byId("germany-region")
  const res = resolutionForTolerance(germany.tolerance)
  const cells = regionCells(germany, res)
  const poland = regionCells(byId("poland-region"), res)
  const area = (cs: H3Cell[]) => cs.reduce((s, h) => s + cellAreaKm2(h), 0)
  const score = (d: Distribution) => scoreArea(d, germany).score

  /** Each part's share of the paint, spread evenly over its cells. */
  const shares = (parts: [H3Cell[], number][], floor = 0.05) => {
    const density = new Map<H3Cell, number>()
    for (const [cs, share] of parts) {
      const d = share / area(cs)
      for (const h of cs) density.set(h, (density.get(h) ?? 0) + d)
    }
    return buildDistribution(
      [...density].map(([h, intensity]) => {
        const [lat, lon] = cellToLatLng(h)
        return { lat, lon, intensity, area: cellAreaKm2(h), h3: h }
      }),
      floor
    )
  }
  /** Germany grown ring by ring until it covers `times` its area. */
  const grown = (times: number) => {
    const set = new Set(cells)
    let frontier = cells
    while (area([...set]) < times * area(cells)) {
      const next: H3Cell[] = []
      for (const h of frontier) {
        for (const n of gridDisk(h, 1)) {
          if (set.has(n)) continue
          next.push(n)
          set.add(n)
        }
      }
      frontier = next
    }
    return [...set]
  }

  it("adds the two up: SHAPE_WEIGHT of shape, the rest nearness", () => {
    const s = scoreArea(coat(poland), germany)
    expect(s.score).toBeCloseTo(SHAPE_WEIGHT * s.shape + (1 - SHAPE_WEIGHT) * s.nearness, 9)
  })

  // Shape is 1000 - 500 (A sum (p - q)^2 / a + 2 m^2), with q = a / A on each
  // of the country's cells and m the paint off it: exact for even coats.
  describe("shape, worked by hand", () => {
    const japan = regionCells(byId("japan-region"), res)
    const shape = (d: Distribution) => scoreArea(d, germany).shape

    it("an exact coat loses only the floor's square: 1000 - 500 f^2", () => {
      expect(shape(coat(cells, 0))).toBeCloseTo(1000, 6)
      expect(shape(coat(cells, 0.05))).toBeCloseTo(998.75, 6)
    })

    it("paint all off the country pays for the empty country and twice its own square: 1000 - 500 (1 + 2 m^2)", () => {
      expect(shape(coat(japan, 0.5))).toBeCloseTo(250, 6)
      expect(shape(coat(japan, 0))).toBe(0)
    })

    it("half on and half off: 1000 - 500 (1/4 + 2/4)", () => {
      expect(
        shape(
          shares(
            [
              [cells, 0.5],
              [japan, 0.5]
            ],
            0
          )
        )
      ).toBeCloseTo(625, 6)
    })
  })

  it("spilling half the paint just past the border scores about 850", () => {
    const s = score(coat(grown(2)))
    expect(s).toBeGreaterThan(800)
    expect(s).toBeLessThan(890)
  })

  it("covering half the country scores about 750", () => {
    const s = score(coat(cells.filter((h) => cellToLatLng(h)[1] < germany.centre.lon)))
    expect(s).toBeGreaterThan(710)
    expect(s).toBeLessThan(830)
  })

  it("half on the country and half on a far one of its size scores about 750, like a 50/50 point answer", () => {
    const s = score(
      shares([
        [cells, 0.5],
        [regionCells(byId("japan-region"), res), 0.5]
      ])
    )
    expect(s).toBeGreaterThan(700)
    expect(s).toBeLessThan(790)
  })

  it("a neighbour scores about half, and a hedge with it more the more paint is on the country", () => {
    const only = score(coat(poland))
    expect(only).toBeGreaterThan(400)
    expect(only).toBeLessThan(550)
    const hedges = [0.2, 0.5, 0.8].map((w) =>
      score(
        shares([
          [cells, w],
          [poland, 1 - w]
        ])
      )
    )
    expect(hedges[0]).toBeGreaterThan(only)
    expect(hedges[0]).toBeLessThan(620)
    expect(hedges[1]).toBeGreaterThan(hedges[0]! + 150)
    expect(hedges[2]).toBeGreaterThan(hedges[1]! + 100)
    expect(hedges[2]).toBeGreaterThan(940)
  })

  it("a faint wash around the country costs more the heavier it is", () => {
    const inside = new Set(cells)
    const ring = grown(4).filter((h) => !inside.has(h))
    const washed = (x: number) =>
      score(
        shares([
          [cells, area(cells)],
          [ring, x * area(ring)]
        ])
      )
    expect(washed(0.1)).toBeGreaterThan(920)
    expect(washed(0.5)).toBeGreaterThan(740)
    expect(washed(0.5)).toBeLessThan(washed(0.1) - 120)
  })

  it("wrong paint spread thinly does not pass for vagueness", () => {
    // A faint blob eight times Germany's area, centred in North America.
    const blob = gridDisk(latLngToCell(40, -100, h3Res(res - 1)), 22)
    expect(area(blob)).toBeGreaterThan(6 * area(cells))
    expect(score(coat(blob))).toBeLessThan(250)
    // The whole world painted evenly: just above a pass.
    const world = getRes0Cells().flatMap((c) => cellToChildren(c, h3Res(2)))
    const w = score(coat(world))
    expect(w).toBeGreaterThan(250)
    expect(w).toBeLessThan(350)
  })

  it("uneven brushing costs little", () => {
    // A band through the middle third, painted twice.
    const lats = cells.map((h) => cellToLatLng(h)[0]).sort((a, b) => a - b)
    const lo = lats[Math.floor(lats.length / 3)]!
    const hi = lats[Math.floor((2 * lats.length) / 3)]!
    const band = cells.filter((h) => cellToLatLng(h)[0] >= lo && cellToLatLng(h)[0] < hi)
    expect(
      score(
        shares([
          [cells, area(cells)],
          [band, area(band)]
        ])
      )
    ).toBeGreaterThan(950)
    // A bright middle fading to half density at the edges.
    const R = Math.sqrt(area(cells) / Math.PI)
    const uneven = buildDistribution(
      cells.map((h) => {
        const [lat, lon] = cellToLatLng(h)
        const km =
          Math.hypot(lat - germany.centre.lat, (lon - germany.centre.lon) * Math.cos((lat * Math.PI) / 180)) * 111
        return { lat, lon, intensity: Math.max(0.5, 1.5 - km / R), area: cellAreaKm2(h), h3: h }
      }),
      0.05
    )
    expect(score(uneven)).toBeGreaterThan(950)
  })
})

describe("coarsenDistribution", () => {
  it("keeps the mass and barely moves a point question's score", () => {
    const answer = { lat: 48.8584, lon: 2.2945 }
    const d = coat(regionCells(byId("france-region"), h3Res(5)))
    const coarse = coarsenDistribution(d, h3Res(4))
    const mass = (x: typeof d) => x.points.reduce((s, p) => s + p.p, 0) + x.floor
    expect(mass(coarse)).toBeCloseTo(1, 9)
    expect(coarse.points.length).toBeLessThan(d.points.length / 4)
    for (const tol of [60, 150]) {
      const diff = Math.abs(scoreDistribution(coarse, answer, tol).score - scoreDistribution(d, answer, tol).score)
      expect(diff).toBeLessThan(5)
    }
  })
})

describe("roundsOverlap", () => {
  const gaborone = pointOf("Gaborone")
  const paris = pointOf("Paris")

  it("finds a place inside a country, and not one far away", () => {
    expect(roundsOverlap(gaborone, byId("botswana-region"))).toBe(true)
    expect(roundsOverlap(byId("botswana-region"), gaborone)).toBe(true)
    expect(roundsOverlap(paris, byId("botswana-region"))).toBe(false)
  })

  it("finds an island inside a country, but not neighbouring countries", () => {
    const honshu = byId(CATALOGUE.find((q) => q.label === "Honshu")!.id)
    expect(roundsOverlap(honshu, byId("japan-region"))).toBe(true)
    expect(roundsOverlap(byId("france-region"), byId("germany-region"))).toBe(false)
  })
})

describe("scoreAnswer", () => {
  it("scores a region by its shape and nearness, a point by its kernel, and nothing painted as a pass", () => {
    const germany = byId("germany-region")
    const painted = paintRegion(germany)
    const region = scoreArea(painted, germany)
    expect(scoreAnswer(painted, germany, DEFAULT_KERNEL)).toEqual({
      score: region.score,
      parts: { type: AnswerType.AREA, shape: region.shape, nearness: region.nearness }
    })

    const place = pointOf("Paris")
    const point = scoreDistribution(painted, place.at, place.tolerance, DEFAULT_KERNEL)
    expect(scoreAnswer(painted, place, DEFAULT_KERNEL)).toEqual({
      score: point.score,
      parts: { type: AnswerType.POINT, A: point.A, B: point.B }
    })

    const pass = { score: PASS_SCORE.score, parts: { type: AnswerType.POINT, A: PASS_SCORE.A, B: PASS_SCORE.B } }
    expect(scoreAnswer(undefined, place, DEFAULT_KERNEL)).toEqual(pass)
    expect(scoreAnswer(undefined, germany, DEFAULT_KERNEL)).toEqual(pass)
  })
})
