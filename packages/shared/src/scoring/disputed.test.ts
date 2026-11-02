import { describe, expect, it } from "vite-plus/test"
import { cellToChildren, cellToParent, h3Resolution, latLngToCell, polygonToCells } from "../h3.ts"
import { outlineId } from "../ids.ts"
import type { Outline } from "../questions.ts"
import { withoutDisputed } from "./disputed.ts"
import { cellPoint } from "./scoring.ts"

/** A square of land, 10° across, west of the prime meridian. */
const SQUARE: Outline = [
  [
    [
      [-10, 0],
      [0, 0],
      [0, 10],
      [-10, 10],
      [-10, 0]
    ]
  ]
]
const land = { outline: outlineId("square-disputed"), polygons: SQUARE }
const resolution = h3Resolution(4)
const disputedCell = polygonToCells(SQUARE[0]!, resolution, true)[0]!
const elsewhere = latLngToCell(40, 40, resolution)

const total = (points: { p: number }[]) => points.reduce((sum, point) => sum + point.p, 0)

describe("withoutDisputed", () => {
  it("leaves paint off the disputed land alone", () => {
    const painted = { points: [cellPoint(elsewhere, 0.95)], floor: 0.05 }
    expect(withoutDisputed(painted, land, resolution)).toBe(painted)
  })

  it("drops paint on it and scales the rest up to the same total", () => {
    const painted = { points: [cellPoint(elsewhere, 0.5), cellPoint(disputedCell, 0.45)], floor: 0.05 }
    const kept = withoutDisputed(painted, land, resolution)!
    expect(kept.points.map((point) => point.cell)).toEqual([elsewhere])
    expect(total(kept.points)).toBeCloseTo(0.95, 9)
    expect(kept.floor).toBe(0.05)
  })

  it("judges finer paint by its cell at the resolution", () => {
    const finer = cellToChildren(disputedCell, h3Resolution(6))[0]!
    expect(withoutDisputed({ points: [cellPoint(finer, 1)], floor: 0 }, land, resolution)).toBeUndefined()
  })

  it("splits coarser paint over the edge, keeping its children off the land", () => {
    const edge = latLngToCell(5, 0, resolution)
    const coarse = cellToParent(edge, h3Resolution(2))
    const kept = withoutDisputed(
      { points: [cellPoint(elsewhere, 0.5), cellPoint(coarse, 0.5)], floor: 0 },
      land,
      resolution
    )!
    const split = kept.points.filter((point) => point.cell !== elsewhere)
    expect(split.length).toBeGreaterThan(0)
    expect(split.length).toBeLessThan(cellToChildren(coarse, resolution).length)
    expect(total(kept.points)).toBeCloseTo(1, 9)
  })

  it("is undefined when all the paint is on it", () => {
    expect(withoutDisputed({ points: [cellPoint(disputedCell, 0.95)], floor: 0.05 }, land, resolution)).toBeUndefined()
  })
})
