import { describe, expect, it } from "vitest"
import { cellToChildren, cellToParent, getResolution, latLngToCell } from "h3-js"
import landJson from "../land.json" with { type: "json" }
import flagsJson from "../flags.json" with { type: "json" }
import regionsJson from "../regions.json" with { type: "json" }
import { LandMask, trimSea } from "./land.ts"
import { QUESTIONS } from "./questions.ts"
import { resolutionForTolerance } from "./paint.ts"
import type { FlagQuestion } from "./flags.ts"
import { regionCells, regionScoringRes, type RegionQuestion } from "./regions.ts"

const mask = new LandMask(landJson)
const at = (lat: number, lon: number, res: number) => latLngToCell(lat, lon, res)

describe("land mask", () => {
  it("keeps paint on every answer, at the resolution it is painted", () => {
    const answers = [
      ...QUESTIONS.map((q) => ({ name: q.label, ...q.answer, t: q.toleranceKm })),
      ...(flagsJson as FlagQuestion[])
        .filter((f) => !f.regionId)
        .map((f) => ({ name: f.label, ...f.answer, t: f.toleranceKm }))
    ]
    const trimmed = answers.filter((a) => !mask.nearLand(at(a.lat, a.lon, resolutionForTolerance(a.t))))
    expect(trimmed.map((a) => a.name)).toEqual([])
  })

  it("keeps a whole country painted exactly", () => {
    // Every cell whose centre is in the outline, at the scoring resolution (the
    // region's own answer point is only for framing: Indonesia's is at sea).
    for (const q of regionsJson as RegionQuestion[]) {
      const lost = regionCells(q, regionScoringRes(q.toleranceKm)).filter((h) => !mask.nearLand(h))
      expect(lost, q.label).toEqual([])
    }
  })

  it("trims open ocean, keeps coasts and small islands", () => {
    for (const [lat, lon] of [
      [0, -140], // mid-Pacific
      [30, -40], // mid-Atlantic
      [-40, 80] // south Indian Ocean
    ])
      expect(mask.nearLand(at(lat!, lon!, 6)), `${lat}, ${lon}`).toBe(false)
    for (const [lat, lon] of [
      [51.5, -0.1], // London
      [50.06, -5.7], // Land's End, on the coast
      [49.95, -6.35], // the Isles of Scilly
      [-8.52, 179.2], // Funafuti, Tuvalu
      [-0.53, 166.93] // Nauru
    ])
      expect(mask.nearLand(at(lat!, lon!, 8)), `${lat}, ${lon}`).toBe(true)
  })

  it("judges a coarse cell by whether any of it is near land", () => {
    // A res-1 cell over the English Channel has land in it; one in the mid-Pacific has none.
    expect(mask.nearLand(at(50, -2, 1))).toBe(true)
    expect(mask.nearLand(at(0, -140, 1))).toBe(false)
    // A fine cell inside a compacted land cell (central Africa) is near land.
    const inland = at(5, 22, 9)
    expect(mask.nearLand(inland)).toBe(true)
    expect(mask.nearLand(cellToChildren(cellToParent(inland, 3), 4)[0]!)).toBe(true)
  })

  it("trimSea keeps the land cells with their intensity and drops the rest", () => {
    const london = at(51.5, -0.1, 6)
    const ocean = at(0, -140, 6)
    const kept = trimSea(
      new Map([
        [london, 2],
        [ocean, 1]
      ]),
      mask,
      6
    )
    expect([...kept]).toEqual([[london, 2]])
  })

  it("splits a coarse cell that is partly at sea into its cells near land, at the same density", () => {
    // A res-3 cell on the Italian coast near Naples: part land, part Tyrrhenian Sea.
    const coast = at(40.7, 14.0, 3)
    const kept = trimSea(new Map([[coast, 3]]), mask, 7)
    expect(kept.has(coast)).toBe(false)
    expect(kept.size).toBeGreaterThan(0)
    expect(kept.size).toBeLessThan(cellToChildren(coast, 5).length)
    for (const [h, v] of kept) {
      expect(getResolution(h)).toBe(5)
      expect(v).toBe(3)
      expect(mask.nearLand(h)).toBe(true)
    }
    // Never finer than the layer: at a coarse layer it splits only that far.
    for (const h of trimSea(new Map([[coast, 3]]), mask, 4).keys()) expect(getResolution(h)).toBeLessThanOrEqual(4)
    // A split child that is also painted on its own gets both densities.
    const child = [...kept.keys()][0]!
    expect(
      trimSea(
        new Map([
          [coast, 3],
          [child, 1]
        ]),
        mask,
        7
      ).get(child)
    ).toBe(4)
    // A coarse cell wholly on land stays as it is.
    const inland = at(5, 22, 3)
    expect([...trimSea(new Map([[inland, 1]]), mask, 7)]).toEqual([[inland, 1]])
  })
})
