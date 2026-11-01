import { describe, expect, it } from "vite-plus/test"
import { cellToParent, getResolution, type H3Cell, h3Resolution, latLngToCell } from "../h3.ts"
import bordersJson from "../../borders.json" with { type: "json" }
import outlinesJson from "../../outlines.json" with { type: "json" }
import { Borders } from "../borders.ts"
import { CATALOGUE, isFlagQuestion, outlinesFrom } from "../catalogue/catalogue.ts"
import { countryFill, FILL_CELL_BUDGET, FILL_DENSITY, FillShapeType, type FillShape } from "./fill.ts"
import { PaintLayer, resolutionForTolerance } from "./paint.ts"
import { AnswerType, answerCentre } from "../questions.ts"
import { scoreAnswer, scoredAnswer } from "../scoring/regions.ts"
import { DEFAULT_KERNEL, buildDistribution } from "../scoring/scoring.ts"
import { outlineId } from "../ids.ts"

const flags = CATALOGUE.filter(isFlagQuestion)
const borders = new Borders(bordersJson, flags)
const outlines = outlinesFrom(outlinesJson)
const flag = (code: string) => flags.find((question) => question.clue.flag === code)!

/** A flag round filled with its own country, as the client does it, and scored. */
const fillAndScore = (code: string, finestResolution?: number): { score: number; cells: H3Cell[] } => {
  const question = flag(code)
  const a = scoredAnswer(question.answer, outlines)
  const resolution = finestResolution ?? resolutionForTolerance(a.tolerance)
  const shape: FillShape =
    a.type === AnswerType.AREA
      ? { type: FillShapeType.OUTLINE, outline: a.polygons, answer: a.centre }
      : borders.fillShape(question)
  const cells = countryFill(shape, h3Resolution(resolution))
  const layer = new PaintLayer(h3Resolution(resolution))
  layer.addCoat(cells, FILL_DENSITY)
  const painted = buildDistribution(layer.toCells(), 0.05)
  return { score: scoreAnswer(painted, a, DEFAULT_KERNEL).score, cells }
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
    const bulgaria = CATALOGUE.find((question) => question.id === "bulgaria-region")!.answer
    const resolution = resolutionForTolerance(bulgaria.tolerance)
    const cells = countryFill(
      {
        type: FillShapeType.OUTLINE,
        outline: outlines.get(outlineId("bulgaria-region"))!,
        answer: answerCentre(bulgaria)
      },
      resolution
    )
    expect(new Set(cells.map(getResolution))).toEqual(new Set([resolution]))
  })

  it("fills a country too small for a cell around its answer", () => {
    const tuvalu = flag("tv")
    const cells = countryFill(borders.fillShape(tuvalu), h3Resolution(4))
    expect(cells.length).toBeGreaterThan(0)
    expect(cells).toContain(
      latLngToCell(answerCentre(tuvalu.answer).lat, answerCentre(tuvalu.answer).lon, h3Resolution(4))
    )
  })

  it("leaves out a hole: Lesotho is not South Africa", () => {
    const cells = new Set(countryFill(borders.fillShape(flag("za")), h3Resolution(5)))
    const maseru = latLngToCell(-29.5, 28.2, h3Resolution(5))
    const joburg = latLngToCell(-26.2, 28.05, h3Resolution(5))
    const has = (cell: H3Cell) =>
      [3, 4, 5].some((resolution) => cells.has(resolution === 5 ? cell : cellToParent(cell, h3Resolution(resolution))))
    expect(has(joburg)).toBe(true)
    expect(has(maseru)).toBe(false)
  })
})

describe("coats", () => {
  it("takes a coat back off, leaving other paint alone", () => {
    const layer = new PaintLayer(h3Resolution(6))
    const coat = [latLngToCell(48, 2, h3Resolution(4))]
    layer.stamp({ lat: 48, lon: 2 }, 5, 0.5) // brush paint, finer, inside the coat's cell
    const before = new Map(layer.cells)
    layer.addCoat(coat, FILL_DENSITY)
    expect(layer.cells.get(coat[0]!)).toBe(FILL_DENSITY)
    layer.removeCoat(coat, FILL_DENSITY)
    expect(before.size).toBeGreaterThan(0)
    expect(new Map(layer.cells)).toEqual(before)
  })

  it("takes a coat off the pieces of a cell the eraser split", () => {
    const layer = new PaintLayer(h3Resolution(6))
    const coat = [latLngToCell(48, 2, h3Resolution(3))]
    layer.addCoat(coat, FILL_DENSITY)
    layer.erase({ lat: 48, lon: 2 }, 5, 0.1) // a small erase splits the coarse cell
    expect(layer.cells.has(coat[0]!)).toBe(false)
    layer.removeCoat(coat, FILL_DENSITY)
    expect(layer.isEmpty).toBe(true)
  })
})
