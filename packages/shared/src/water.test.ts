import { describe, expect, it } from "vitest"
import { getResolution, latLngToCell } from "h3-js"
import waterJson from "../water.json" with { type: "json" }
import featuresJson from "../features.json" with { type: "json" }
import { WaterMask, paintAmount, trimLand } from "./land.ts"
import { resolutionForTolerance } from "./paint.ts"
import type { Question } from "./questions.ts"
import { regionCells, type RegionQuestion } from "./regions.ts"

const mask = new WaterMask(waterJson)
const at = (lat: number, lon: number, res: number) => latLngToCell(lat, lon, res)

describe("water mask", () => {
  it("keeps a lake or sea painted exactly", () => {
    const water = (featuresJson as (Question | RegionQuestion)[]).filter(
      (q): q is RegionQuestion => q.kind === "region" && (q.topic === "lake" || q.topic === "sea")
    )
    expect(water).toHaveLength(22)
    for (const q of water) {
      const cells = new Map(regionCells(q, resolutionForTolerance(q.toleranceKm)).map((h) => [h, 1]))
      const kept = paintAmount(trimLand(cells, mask, resolutionForTolerance(q.toleranceKm))) / paintAmount(cells)
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
    const kept = trimLand(new Map([[coast, 2]]), mask, 7)
    expect(kept.has(coast)).toBe(false)
    expect(kept.size).toBeGreaterThan(0)
    for (const [h, v] of kept) {
      expect(getResolution(h)).toBe(5)
      expect(v).toBe(2)
      expect(mask.nearWater(h)).toBe(true)
    }
    expect([...trimLand(new Map([[at(30, -40, 3), 1]]), mask, 7).keys()]).toEqual([at(30, -40, 3)])
  })
})
