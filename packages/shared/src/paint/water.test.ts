import { describe, expect, it } from "vite-plus/test"
import { cellToChildren, getResolution, h3Resolution, latLngToCell, type H3Cell } from "../h3.ts"
import waterJson from "../../water.json" with { type: "json" }
import outlinesJson from "../../outlines.json" with { type: "json" }
import { WaterMask, paintAmount, trimLand } from "./land.ts"
import { resolutionForTolerance } from "./paint.ts"
import { regionCells, scoredAnswer, type Area } from "../scoring/regions.ts"
import { CATALOGUE, outlinesFrom } from "../catalogue/catalogue.ts"
import { AnswerType, Surface } from "../questions.ts"

const seaMask = new WaterMask(waterJson, Surface.SEA)
const lakeMask = new WaterMask(waterJson, Surface.LAKE)
const maskFor = (surface: Surface): WaterMask => (surface === Surface.LAKE ? lakeMask : seaMask)
const at = (lat: number, lon: number, resolution: number): H3Cell => latLngToCell(lat, lon, h3Resolution(resolution))

describe("water mask", () => {
  it("keeps a lake or sea painted exactly", () => {
    const outlines = outlinesFrom(outlinesJson)
    const water = CATALOGUE.flatMap((question) =>
      question.answer.type === AnswerType.AREA && question.answer.surface !== Surface.LAND
        ? [{ label: question.label, ...(scoredAnswer(question.answer, outlines) as Area) }]
        : []
    )
    expect(water).toHaveLength(22)
    for (const question of water) {
      const cells = new Map(regionCells(question, resolutionForTolerance(question.tolerance)).map((cell) => [cell, 1]))
      const mask = maskFor(question.surface)
      const kept = paintAmount(trimLand(cells, mask, resolutionForTolerance(question.tolerance))) / paintAmount(cells)
      expect(kept, question.label).toBe(1)
    }
  })

  it("trims inland, keeps seas, lakes and coasts", () => {
    for (const mask of [seaMask, lakeMask]) {
      for (const [lat, lon] of [
        [23, 13], // the Sahara
        [48, 2.35], // Paris
        [40, -100], // Kansas
        [52.337, -87.639] // northern Ontario, by a small lake
      ])
        expect(mask.nearWater(at(lat!, lon!, 6)), `${lat}, ${lon}`).toBe(false)
      for (const [lat, lon] of [
        [30, -40], // mid-Atlantic
        [42, 50.5], // the Caspian
        [50.06, -5.7] // Land's End, on the coast
      ])
        expect(mask.nearWater(at(lat!, lon!, 8)), `${lat}, ${lon}`).toBe(true)
    }
  })

  it("ignores lakes in a sea round", () => {
    for (const [lat, lon] of [
      [-1, 33], // Lake Victoria
      [53.5, 108], // Lake Baikal
      [61.3, 28.4] // Saimaa, in Finland's lake district
    ]) {
      expect(seaMask.nearWater(at(lat!, lon!, 8)), `${lat}, ${lon}`).toBe(false)
      expect(lakeMask.nearWater(at(lat!, lon!, 8)), `${lat}, ${lon}`).toBe(true)
    }
  })

  it("splits a coarse cell on the shore into its cells near water", () => {
    // A resolution-3 cell on the Italian coast near Naples: part land, part Tyrrhenian Sea.
    const coast = at(40.7, 14.0, 3)
    const kept = trimLand(new Map([[coast, 2]]), seaMask, h3Resolution(7))
    expect(kept.has(coast)).toBe(false)
    expect(kept.size).toBeGreaterThan(0)
    for (const [cell, count] of kept) {
      expect(getResolution(cell)).toBe(6)
      expect(count).toBe(2)
      expect(seaMask.nearWater(cell)).toBe(true)
    }
    expect([...trimLand(new Map([[at(30, -40, 3), 1]]), seaMask, h3Resolution(7)).keys()]).toEqual([at(30, -40, 3)])
  })

  it("keeps paint coarser than the mask only where 3 of its 7 parts are wet", () => {
    const cell = at(52, -87, 4)
    const parts = cellToChildren(cell, h3Resolution(5))
    const withDry = (count: number): WaterMask =>
      new WaterMask({ resolution: 5, dry: parts.slice(0, count), lakes: [] }, Surface.SEA)
    const trim = (count: number): H3Cell[] => [
      ...trimLand(new Map([[cell, 1]]), withDry(count), h3Resolution(4)).keys()
    ]
    expect(withDry(4).wetShare(cell)).toBeCloseTo(3 / 7)
    expect(trim(4)).toEqual([cell])
    expect(trim(5)).toEqual([])
  })
})
