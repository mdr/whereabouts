import { describe, expect, it } from "vite-plus/test"
import { Borders } from "@whereabouts/shared/borders"
import { CATALOGUE, isFlagQuestion } from "@whereabouts/shared/catalogue/catalogue"
import { h3Resolution } from "@whereabouts/shared/h3"
import { PaintLayer } from "@whereabouts/shared/paint/paint"
import bordersJson from "@whereabouts/shared/borders.json"
import { mainCountry } from "./main-country"

const borders = new Borders(bordersJson, CATALOGUE.filter(isFlagQuestion))

/** A paint of these cells, one intensity each, as a reveal gets it. */
const paint = (cells: string[]) =>
  PaintLayer.fromRecord(h3Resolution(5), Object.fromEntries(cells.map((cell) => [cell, 1]))).toCells()

describe("mainCountry", () => {
  it("names the country with most of the paint", () => {
    // Resolution-5 cells in Brasília and São Paulo, and one in Lima.
    const where = mainCountry(borders, paint(["85a8c24bfffffff", "85a8115bfffffff", "858e62c3fffffff"]))
    expect(where?.country.label).toBe("Brazil")
    expect(where?.share).toBeCloseTo(2 / 3, 1)
  })

  it("names none when the paint is mostly at sea", () => {
    // Five cells in the mid-Atlantic and one in Brasília: a sixth is under the bar.
    const sea = ["853a6507fffffff", "853a6597fffffff", "853b4b33fffffff", "853b4b87fffffff", "853b4823fffffff"]
    expect(mainCountry(borders, paint([...sea, "85a8c24bfffffff"]))).toBeUndefined()
  })
})
