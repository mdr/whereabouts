// @vitest-environment happy-dom
import { describe, expect, it } from "vitest"
import { render } from "@testing-library/preact"
import { Borders, PaintLayer, type FlagQuestion } from "@whereabouts/shared"
import bordersJson from "@whereabouts/shared/borders.json"
import flagsJson from "@whereabouts/shared/flags.json"
import { mainCountry, PaintedIn } from "./FlagReveal"

const flags = flagsJson as FlagQuestion[]
const borders = new Borders(bordersJson, flags)
const brazil = flags.find((f) => f.flag === "br")!

/** A paint of these cells, one intensity each, as a reveal gets it. */
const paint = (cells: string[]) => PaintLayer.fromRecord(5, Object.fromEntries(cells.map((h) => [h, 1]))).toCells()

describe("mainCountry", () => {
  it("names the country with most of the paint", () => {
    // Res-5 cells in Brasília and São Paulo, and one in Lima.
    const where = mainCountry(borders, paint(["85a8c24bfffffff", "85a8115bfffffff", "858e62c3fffffff"]))
    expect(where?.country.label).toBe("Brazil")
    expect(where?.share).toBeCloseTo(2 / 3, 1)
  })

  it("names none when the paint is mostly at sea", () => {
    // Five cells in the mid-Atlantic and one in Brasília: a sixth is under the bar.
    const sea = ["853a6507fffffff", "853a6597fffffff", "853b4b33fffffff", "853b4b87fffffff", "853b4823fffffff"]
    expect(mainCountry(borders, paint([...sea, "85a8c24bfffffff"]))).toBeNull()
  })
})

describe("PaintedIn", () => {
  it("shows the flag, the country and the share, marked when it is the answer", () => {
    const { container, rerender } = render(
      <PaintedIn where={{ country: brazil, share: 0.62 }} answer="pe" whose="Ann's" />
    )
    const el = container.querySelector(".painted-in")!
    expect(el.textContent).toBe("Brazil62%")
    expect(el.getAttribute("title")).toBe("62% of Ann's paint was in Brazil")
    expect(el.classList.contains("right")).toBe(false)
    rerender(<PaintedIn where={{ country: brazil, share: 0.62 }} answer="br" whose="your" />)
    expect(container.querySelector(".painted-in.right")!.getAttribute("title")).toBe(
      "62% of your paint was in Brazil, the answer"
    )
  })
})
