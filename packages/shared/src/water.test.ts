import { describe, expect, it } from "vite-plus/test"
import { getResolution, h3Res, latLngToCell } from "./h3.ts"
import waterJson from "../water.json" with { type: "json" }
import outlinesJson from "../outlines.json" with { type: "json" }
import { WaterMask, paintAmount, trimLand } from "./land.ts"
import { resolutionForTolerance } from "./paint.ts"
import { regionCells, scoredAnswer, type Area } from "./regions.ts"
import { CATALOGUE, outlinesFrom } from "./catalogue.ts"
import { AnswerType, Surface } from "./questions.ts"

const mask = new WaterMask(waterJson)
const at = (lat: number, lon: number, res: number) => latLngToCell(lat, lon, h3Res(res))

describe("water mask", () => {
  it("keeps a lake or sea painted exactly", () => {
    const outlines = outlinesFrom(outlinesJson)
    const water = CATALOGUE.flatMap((q) =>
      q.answer.type === AnswerType.AREA && q.answer.surface === Surface.WATER
        ? [{ label: q.label, ...(scoredAnswer(q.answer, outlines) as Area) }]
        : []
    )
    expect(water).toHaveLength(22)
    for (const q of water) {
      const cells = new Map(regionCells(q, resolutionForTolerance(q.tolerance)).map((h) => [h, 1]))
      const kept = paintAmount(trimLand(cells, mask, resolutionForTolerance(q.tolerance))) / paintAmount(cells)
      expect(kept, q.label).toBe(1)
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
    // A res-3 cell on the Italian coast near Naples: part land, part Tyrrhenian Sea.
    const coast = at(40.7, 14.0, 3)
    const kept = trimLand(new Map([[coast, 2]]), mask, h3Res(7))
    expect(kept.has(coast)).toBe(false)
    expect(kept.size).toBeGreaterThan(0)
    for (const [h, v] of kept) {
      expect(getResolution(h)).toBe(5)
      expect(v).toBe(2)
      expect(mask.nearWater(h)).toBe(true)
    }
    expect([...trimLand(new Map([[at(30, -40, 3), 1]]), mask, h3Res(7)).keys()]).toEqual([at(30, -40, 3)])
  })
})
