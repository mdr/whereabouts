import { describe, expect, it } from "vite-plus/test"
import { HINT_WIDTH_TOLERANCES, describeHint, hintBand, inHintBand, seededUnit, trimToHint, HintAxis } from "./hints.ts"
import { CATALOGUE } from "./catalogue/catalogue.ts"
import { answerCentre } from "./questions.ts"
import { PaintLayer, resolutionForTolerance } from "./paint/paint.ts"
import { cellToLatLng, h3Res, latLngToCell, type H3Cell } from "./h3.ts"

describe("hintBand", () => {
  const axes: HintAxis[] = [HintAxis.LATITUDE, HintAxis.LONGITUDE]

  it("always holds the answer, for every question and either axis, wherever in the band it falls", () => {
    for (const { answer } of CATALOGUE) {
      const at = answerCentre(answer)
      for (const axis of axes)
        for (const along of [0, 0.37, 1]) expect(inHintBand(hintBand(at, answer.tolerance, axis, along), at)).toBe(true)
    }
  })

  it("is about ten tolerances wide, and never puts the answer at an edge", () => {
    const answer = { lat: 27.1751, lon: 78.0421 }
    for (const along of [0, 1]) {
      const band = hintBand(answer, 150, HintAxis.LATITUDE, along)
      const km = (band.to - band.from) * 111.195
      expect(km).toBeGreaterThanOrEqual(HINT_WIDTH_TOLERANCES * 150)
      expect(km).toBeLessThan(HINT_WIDTH_TOLERANCES * 150 + 2 * 111.195)
      expect(answer.lat - band.from).toBeGreaterThan(0.1 * (band.to - band.from))
      expect(band.to - answer.lat).toBeGreaterThan(0.1 * (band.to - band.from))
    }
  })

  it("wraps a longitude band across 180°, and stays inside the poles", () => {
    const fiji = { lat: -17.7, lon: 179.5 }
    const band = hintBand(fiji, 150, HintAxis.LONGITUDE, 0.5)
    expect(band.from).toBeGreaterThan(band.to)
    expect(inHintBand(band, fiji)).toBe(true)
    expect(inHintBand(band, { lat: 0, lon: 0 })).toBe(false)
    const pole = hintBand({ lat: 89, lon: 0 }, 300, HintAxis.LATITUDE, 1)
    expect(pole.to).toBeLessThanOrEqual(90)
    expect(inHintBand(pole, { lat: 89, lon: 0 })).toBe(true)
  })

  it("rounds a narrow band to tenths of a degree", () => {
    const band = hintBand({ lat: 51.5, lon: -0.1 }, 10, HintAxis.LATITUDE, 0.5)
    expect(band.to - band.from).toBeLessThan(2)
    expect(band.from * 10).toBe(Math.round(band.from * 10))
  })
})

describe("trimToHint", () => {
  const latLon = (cell: H3Cell) => {
    const [lat, lon] = cellToLatLng(cell)
    return { lat, lon }
  }

  it("keeps the paint in the band, cut down to the layer's finest cells at its edges", () => {
    const layer = new PaintLayer(resolutionForTolerance(150))
    layer.stamp({ lat: 30, lon: 10 }, 1500, 1)
    const band = { axis: HintAxis.LATITUDE, from: 28, to: 34 }
    const kept = trimToHint(layer.cells, band, layer.res)
    expect(kept.size).toBeGreaterThan(0)
    expect(kept.size).toBeLessThan(layer.cells.size * 4)
    const lats = [...kept.keys()].map((cell) => latLon(cell).lat)
    expect(Math.min(...lats)).toBeGreaterThan(27)
    expect(Math.max(...lats)).toBeLessThan(35)
    // The paint in the band is all still there.
    expect(
      [...layer.cells.keys()]
        .filter((cell) => latLon(cell).lat > 29 && latLon(cell).lat < 33)
        .every((cell) => kept.has(cell))
    ).toBe(true)
  })

  it("keeps a longitude band across 180° as one band", () => {
    const resolution = h3Res(3)
    const cells = new Map([
      [latLngToCell(0, 179, resolution), 1],
      [latLngToCell(0, -179, resolution), 1],
      [latLngToCell(0, 0, resolution), 1]
    ])
    const kept = trimToHint(cells, { axis: HintAxis.LONGITUDE, from: 175, to: -175 }, resolution)
    expect([...kept.keys()].map((cell) => Math.round(latLon(cell).lon)).sort()).toEqual([-179, 179])
  })
})

describe("describeHint", () => {
  it("names the edges with compass letters", () => {
    expect(describeHint({ axis: HintAxis.LATITUDE, from: 23, to: 37 })).toBe("Between 23°N and 37°N")
    expect(describeHint({ axis: HintAxis.LATITUDE, from: -5.5, to: 4 })).toBe("Between 5.5°S and 4°N")
    expect(describeHint({ axis: HintAxis.LONGITUDE, from: 170, to: -165 })).toBe("Between 170°E and 165°W")
  })
})

describe("seededUnit", () => {
  it("depends only on its inputs, and spreads across 0 to 1", () => {
    expect(seededUnit(1, 2, 3)).toBe(seededUnit(1, 2, 3))
    const values = Array.from({ length: 200 }, (_, i) => seededUnit(42, i, 1))
    expect(Math.min(...values)).toBeLessThan(0.1)
    expect(Math.max(...values)).toBeGreaterThan(0.9)
    for (const value of values) expect(value >= 0 && value < 1).toBe(true)
  })
})
