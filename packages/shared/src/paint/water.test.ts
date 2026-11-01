import { describe, expect, it } from "vite-plus/test"
import { getResolution, h3Resolution, latLngToCell } from "../h3.ts"
import waterJson from "../../water.json" with { type: "json" }
import outlinesJson from "../../outlines.json" with { type: "json" }
import { WaterMask, paintAmount, trimLand } from "./land.ts"
import { resolutionForTolerance } from "./paint.ts"
import { regionCells, scoredAnswer, type Area } from "../scoring/regions.ts"
import { CATALOGUE, outlinesFrom } from "../catalogue/catalogue.ts"
import { AnswerType, Surface } from "../questions.ts"

const mask = new WaterMask(waterJson)
const at = (lat: number, lon: number, resolution: number) => latLngToCell(lat, lon, h3Resolution(resolution))

describe("water mask", () => {
  it("keeps a lake or sea painted exactly", () => {
    const outlines = outlinesFrom(outlinesJson)
    const water = CATALOGUE.flatMap((question) =>
      question.answer.type === AnswerType.AREA && question.answer.surface === Surface.WATER
        ? [{ label: question.label, ...(scoredAnswer(question.answer, outlines) as Area) }]
        : []
    )
    expect(water).toHaveLength(22)
    for (const question of water) {
      const cells = new Map(regionCells(question, resolutionForTolerance(question.tolerance)).map((cell) => [cell, 1]))
      const kept = paintAmount(trimLand(cells, mask, resolutionForTolerance(question.tolerance))) / paintAmount(cells)
      expect(kept, question.label).toBe(1)
    }
  })

  it("trims inland, keeps seas, lakes and coasts", () => {
    for (const [lat, lon] of [
      [23, 13], // the Sahara
      [48, 2.35], // Paris
      [40, -100] // Kansas
    ])
      expect(mask.nearWater(at(lat!, lon!, 6)), `${lat}, ${lon}`).toBe(false)
    for (const [lat, lon] of [
      [30, -40], // mid-Atlantic
      [42, 50.5], // the Caspian
      [-1, 33], // Lake Victoria
      [53.5, 108], // Lake Baikal
      [50.06, -5.7] // Land's End, on the coast
    ])
      expect(mask.nearWater(at(lat!, lon!, 8)), `${lat}, ${lon}`).toBe(true)
  })

  it("splits a coarse cell on the shore into its cells near water", () => {
    // A resolution-3 cell on the Italian coast near Naples: part land, part Tyrrhenian Sea.
    const coast = at(40.7, 14.0, 3)
    const kept = trimLand(new Map([[coast, 2]]), mask, h3Resolution(7))
    expect(kept.has(coast)).toBe(false)
    expect(kept.size).toBeGreaterThan(0)
    for (const [cell, count] of kept) {
      expect(getResolution(cell)).toBe(5)
      expect(count).toBe(2)
      expect(mask.nearWater(cell)).toBe(true)
    }
    expect([...trimLand(new Map([[at(30, -40, 3), 1]]), mask, h3Resolution(7)).keys()]).toEqual([at(30, -40, 3)])
  })
})
