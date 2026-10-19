import { describe, expect, it } from "vite-plus/test"
import {
  HINT_WIDTH_TOLERANCES,
  describeHint,
  hintBand,
  inHintBand,
  seededUnit,
  trimToHint,
  type HintAxis
} from "./hints.ts"
import { QUESTIONS } from "./questions.ts"
import { PaintLayer, resolutionForTolerance } from "./paint.ts"
import { cellToLatLng, h3Res, latLngToCell, type H3Cell } from "./h3.ts"

describe("hintBand", () => {
  const axes: HintAxis[] = ["latitude", "longitude"]

  it("always holds the answer, for every question and either axis, wherever in the band it falls", () => {
    for (const q of QUESTIONS)
      for (const axis of axes)
        for (const u of [0, 0.37, 1])
          expect(inHintBand(hintBand(q.answer, q.toleranceKm, axis, u), q.answer)).toBe(true)
  })

  it("is about ten tolerances wide, and never puts the answer at an edge", () => {
    const answer = { lat: 27.1751, lon: 78.0421 }
    for (const u of [0, 1]) {
      const band = hintBand(answer, 150, "latitude", u)
      const km = (band.to - band.from) * 111.195
      expect(km).toBeGreaterThanOrEqual(HINT_WIDTH_TOLERANCES * 150)
      expect(km).toBeLessThan(HINT_WIDTH_TOLERANCES * 150 + 2 * 111.195)
      expect(answer.lat - band.from).toBeGreaterThan(0.1 * (band.to - band.from))
      expect(band.to - answer.lat).toBeGreaterThan(0.1 * (band.to - band.from))
    }
  })

  it("wraps a longitude band across 180°, and stays inside the poles", () => {
    const fiji = { lat: -17.7, lon: 179.5 }
    const band = hintBand(fiji, 150, "longitude", 0.5)
    expect(band.from).toBeGreaterThan(band.to)
    expect(inHintBand(band, fiji)).toBe(true)
    expect(inHintBand(band, { lat: 0, lon: 0 })).toBe(false)
    const pole = hintBand({ lat: 89, lon: 0 }, 300, "latitude", 1)
    expect(pole.to).toBeLessThanOrEqual(90)
    expect(inHintBand(pole, { lat: 89, lon: 0 })).toBe(true)
  })

  it("rounds a narrow band to tenths of a degree", () => {
    const band = hintBand({ lat: 51.5, lon: -0.1 }, 10, "latitude", 0.5)
    expect(band.to - band.from).toBeLessThan(2)
    expect(band.from * 10).toBe(Math.round(band.from * 10))
  })
})

describe("trimToHint", () => {
  const latLon = (h: H3Cell) => {
    const [lat, lon] = cellToLatLng(h)
    return { lat, lon }
  }

  it("keeps the paint in the band, cut down to the layer's finest cells at its edges", () => {
    const layer = new PaintLayer(resolutionForTolerance(150))
    layer.stamp({ lat: 30, lon: 10 }, 1500, 1)
    const band = { axis: "latitude" as const, from: 28, to: 34 }
    const kept = trimToHint(layer.cells, band, layer.res)
    expect(kept.size).toBeGreaterThan(0)
    expect(kept.size).toBeLessThan(layer.cells.size * 4)
    const lats = [...kept.keys()].map((h) => latLon(h).lat)
    expect(Math.min(...lats)).toBeGreaterThan(27)
    expect(Math.max(...lats)).toBeLessThan(35)
    // The paint in the band is all still there.
    expect(
      [...layer.cells.keys()].filter((h) => latLon(h).lat > 29 && latLon(h).lat < 33).every((h) => kept.has(h))
    ).toBe(true)
  })

  it("keeps a longitude band across 180° as one band", () => {
    const res = h3Res(3)
    const cells = new Map([
      [latLngToCell(0, 179, res), 1],
      [latLngToCell(0, -179, res), 1],
      [latLngToCell(0, 0, res), 1]
    ])
    const kept = trimToHint(cells, { axis: "longitude", from: 175, to: -175 }, res)
    expect([...kept.keys()].map((h) => Math.round(latLon(h).lon)).sort()).toEqual([-179, 179])
  })
})

describe("describeHint", () => {
  it("names the edges with compass letters", () => {
    expect(describeHint({ axis: "latitude", from: 23, to: 37 })).toBe("Between 23°N and 37°N")
    expect(describeHint({ axis: "latitude", from: -5.5, to: 4 })).toBe("Between 5.5°S and 4°N")
    expect(describeHint({ axis: "longitude", from: 170, to: -165 })).toBe("Between 170°E and 165°W")
  })
})

describe("seededUnit", () => {
  it("depends only on its inputs, and spreads across 0 to 1", () => {
    expect(seededUnit(1, 2, 3)).toBe(seededUnit(1, 2, 3))
    const values = Array.from({ length: 200 }, (_, i) => seededUnit(42, i, 1))
    expect(Math.min(...values)).toBeLessThan(0.1)
    expect(Math.max(...values)).toBeGreaterThan(0.9)
    for (const v of values) expect(v >= 0 && v < 1).toBe(true)
  })
})
