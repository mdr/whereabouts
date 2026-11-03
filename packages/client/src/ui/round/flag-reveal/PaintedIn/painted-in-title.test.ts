import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE, isFlagQuestion } from "@whereabouts/shared/catalogue/catalogue"
import { paintedInTitle, paintedPercent } from "./painted-in-title"

const brazil = CATALOGUE.filter(isFlagQuestion).find((question) => question.clue.flag === "br")!

describe("paintedInTitle", () => {
  it("gives the share as a rounded percent, in the painter's name", () => {
    expect(paintedInTitle({ country: brazil, share: 0.625 }, "pe", "Ann's")).toBe("63% of Ann's paint was in Brazil")
    expect(paintedPercent({ country: brazil, share: 0.624 })).toBe(62)
  })

  it("adds that it is the answer", () => {
    expect(paintedInTitle({ country: brazil, share: 0.62 }, "br", "your")).toBe(
      "62% of your paint was in Brazil, the answer"
    )
  })

  it("does not, when the answer is not known", () => {
    expect(paintedInTitle({ country: brazil, share: 0.62 }, undefined, "your")).toBe("62% of your paint was in Brazil")
  })
})
