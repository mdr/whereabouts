import { describe, expect, it } from "vitest"
import { cellToParent, getResolution, latLngToCell } from "h3-js"
import bordersJson from "../borders.json" with { type: "json" }
import flagsJson from "../flags.json" with { type: "json" }
import regionsJson from "../regions.json" with { type: "json" }
import { Borders } from "./borders.ts"
import { countryFill, FILL_CELL_BUDGET, FILL_DENSITY } from "./fill.ts"
import { flagRound, type FlagQuestion } from "./flags.ts"
import { PaintLayer, resolutionForTolerance } from "./paint.ts"
import { scoreRegionQuestion, type RegionQuestion } from "./regions.ts"
import { buildDistribution, scoreDistribution } from "./scoring.ts"

const flags = flagsJson as FlagQuestion[]
const borders = new Borders(bordersJson, flags)
const regions = new Map((regionsJson as RegionQuestion[]).map((r) => [r.id, r]))
const flag = (code: string) => flags.find((f) => f.flag === code)!

/** A flag round filled with its own country, as the client does it, and scored. */
function fillAndScore(code: string, finestRes?: number): { score: number; cells: string[] } {
  const f = flag(code)
  const q = flagRound(f, regions)!
  const res = finestRes ?? resolutionForTolerance(q.toleranceKm)
  const region = f.regionId ? regions.get(f.regionId) : undefined
  const cells = countryFill(region ? { polygons: region.outline, answer: f.answer } : borders.fillShape(f), res)
  const layer = new PaintLayer(res)
  layer.addCoat(cells, FILL_DENSITY)
  const dist = buildDistribution(layer.toCells(), 0.05)
  const score =
    q.kind === "region" ? scoreRegionQuestion(dist, q).score : scoreDistribution(dist, q.answer, q.toleranceKm).score
  return { score, cells }
}

describe("countryFill", () => {
  it("fills the right country, painted whole, for a near-perfect score", () => {
    for (const code of ["fr", "br", "cl", "id"]) expect(fillAndScore(code).score, code).toBeGreaterThan(990)
    // On a much finer grid than its own, a big country still scores as well.
    expect(fillAndScore("br", 7).score).toBeGreaterThan(990)
  })

  it("scores a country asked as a point like an even coat of it", () => {
    expect(fillAndScore("ru").score).toBeGreaterThan(850)
    expect(fillAndScore("mt").score).toBeGreaterThan(900)
  })

  it("keeps a big country within budget on a fine grid, at one resolution", () => {
    const { cells } = fillAndScore("ru", 7)
    expect(cells.length).toBeLessThanOrEqual(FILL_CELL_BUDGET)
    const resolutions = new Set(cells.map(getResolution))
    expect(resolutions.size).toBe(1)
    expect([...resolutions][0]).toBeLessThan(7)
  })

  it("fills a country round at its own resolution, uncompacted, so it draws without gaps", () => {
    // Compacted, a parent hexagon is turned from its children and left gaps.
    const bg = regions.get("bulgaria-region")!
    const res = resolutionForTolerance(bg.toleranceKm)
    const cells = countryFill({ polygons: bg.outline, answer: bg.answer }, res)
    expect(new Set(cells.map(getResolution))).toEqual(new Set([res]))
  })

  it("fills a country too small for a cell around its answer", () => {
    const tv = flag("tv")
    const cells = countryFill(borders.fillShape(tv), 4)
    expect(cells.length).toBeGreaterThan(0)
    expect(cells).toContain(latLngToCell(tv.answer.lat, tv.answer.lon, 4))
  })

  it("leaves out a hole: Lesotho is not South Africa", () => {
    const cells = new Set(countryFill(borders.fillShape(flag("za")), 5))
    const maseru = latLngToCell(-29.5, 28.2, 5)
    const joburg = latLngToCell(-26.2, 28.05, 5)
    const has = (h: string) => [3, 4, 5].some((r) => cells.has(r === 5 ? h : cellToParent(h, r)))
    expect(has(joburg)).toBe(true)
    expect(has(maseru)).toBe(false)
  })
})

describe("coats", () => {
  it("takes a coat back off, leaving other paint alone", () => {
    const layer = new PaintLayer(6)
    const coat = [latLngToCell(48, 2, 4)]
    layer.stamp({ lat: 48, lon: 2 }, 5, 0.5) // brush paint, finer, inside the coat's cell
    const before = new Map(layer.cells)
    layer.addCoat(coat, FILL_DENSITY)
    expect(layer.cells.get(coat[0]!)).toBe(FILL_DENSITY)
    layer.removeCoat(coat, FILL_DENSITY)
    expect(before.size).toBeGreaterThan(0)
    expect(new Map(layer.cells)).toEqual(before)
  })

  it("takes a coat off the pieces of a cell the eraser split", () => {
    const layer = new PaintLayer(6)
    const coat = [latLngToCell(48, 2, 3)]
    layer.addCoat(coat, FILL_DENSITY)
    layer.erase({ lat: 48, lon: 2 }, 5, 0.1) // a small erase splits the coarse cell
    expect(layer.cells.has(coat[0]!)).toBe(false)
    layer.removeCoat(coat, FILL_DENSITY)
    expect(layer.isEmpty).toBe(true)
  })
})
