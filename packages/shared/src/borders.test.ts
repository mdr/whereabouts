import { describe, expect, it } from "vitest"
import { cellArea, cellToLatLng, latLngToCell, gridDisk, UNITS } from "h3-js"
import bordersJson from "../borders.json" with { type: "json" }
import flagsJson from "../flags.json" with { type: "json" }
import { Borders } from "./borders.ts"
import type { FlagQuestion } from "./flags.ts"
import type { PaintCell } from "./paint.ts"

const flags = flagsJson as FlagQuestion[]
const borders = new Borders(bordersJson, flags)
const at = (lat: number, lon: number) => borders.countryAt({ lat, lon })?.label ?? null

function cell(h: string, intensity = 1): PaintCell {
  const [lat, lon] = cellToLatLng(h)
  return { lat, lon, intensity, areaKm2: cellArea(h, UNITS.km2), h3: h }
}

describe("borders", () => {
  it("names the country at a point", () => {
    expect(at(48.85, 2.35)).toBe("France")
    expect(at(-12.05, -77.04)).toBe("Peru")
    expect(at(64.5, 40.5)).toBe("Russia") // Arkhangelsk
    expect(at(66, -175)).toBe("Russia") // Chukotka, across the antimeridian
    expect(at(61.2, -149.9)).toBe("United States") // Anchorage
    expect(at(-26.2, 28.05)).toBe("South Africa")
    expect(at(-29.31, 27.48)).toBe("Lesotho") // a hole in South Africa
    expect(at(30, -40)).toBeNull() // the mid-Atlantic
  })

  it("names a small country near its answer, even on a neighbour's land", () => {
    expect(at(43.94, 12.45)).toBe("San Marino")
    expect(at(-8.52, 179.2)).toBe("Tuvalu")
    expect(at(1.35, 103.82)).toBe("Singapore")
    expect(at(45.46, 9.19)).toBe("Italy") // Milan
  })

  it("names no country where the border is in dispute", () => {
    expect(at(44.95, 34.1)).toBeNull() // Simferopol, Crimea
    expect(at(27.15, -13.2)).toBeNull() // Laayoune, Western Sahara
    expect(at(24, -14)).toBeNull() // Western Sahara, further south
    expect(at(31.9, 35.2)).toBeNull() // Ramallah
    expect(at(50.45, 30.52)).toBe("Ukraine") // Kyiv
    expect(at(28.0, -11.0)).toBe("Morocco") // north of the border
    expect(at(22, -12)).toBe("Mauritania")
  })

  it("finds every flag country somewhere: on its answer, or in its land", () => {
    // A painted country's answer is its centre, which can be at sea (Japan)
    // or in a neighbour (Vietnam's is in Laos); only those miss.
    const missed = flags.filter((f) => borders.countryAt(f.answer)?.flag !== f.flag).map((f) => f.label)
    expect(missed.sort()).toEqual(
      ["Fiji", "Haiti", "Indonesia", "Japan", "Malaysia", "Philippines", "Solomon Islands", "Vietnam"].sort()
    )
  })

  it("finds a small country within a few pixels of the pointer", () => {
    // 25 km off Funafuti: beyond Tuvalu's own 15 km, but within 10 px at 5 km a pixel.
    expect(borders.smallNear({ lat: -8.3, lon: 179.2 }, 0, 0)).toBeNull()
    expect(borders.smallNear({ lat: -8.3, lon: 179.2 }, 5, 10)?.label).toBe("Tuvalu")
  })

  it("splits paint by country, by mass", () => {
    const paris = latLngToCell(48.85, 2.35, 6)
    const lima = latLngToCell(-12.05, -77.04, 6)
    const sea = latLngToCell(30, -40, 6)
    // Equal areas, so the shares are the intensities': 3 of 5 in France, 1 in Peru, 1 at sea.
    const even = (h: string, v: number) => ({ ...cell(h, v), areaKm2: 1 })
    const split = borders.paintedCountries([even(paris, 3), even(lima, 1), even(sea, 1)])
    expect(split.map((s) => s.country.label)).toEqual(["France", "Peru"])
    expect(split[0]!.share).toBeCloseTo(0.6, 1)
    expect(split[1]!.share).toBeCloseTo(0.2, 1)
    // A blob on Peru is mostly in Peru.
    const blob = gridDisk(latLngToCell(-10, -75, 4), 3).map((h) => cell(h))
    expect(borders.paintedCountries(blob)[0]!.country.label).toBe("Peru")
    expect(borders.paintedCountries([])).toEqual([])
  })
})
