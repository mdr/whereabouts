// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test"
import { render, screen } from "@testing-library/preact"
import { CATALOGUE, isFlagQuestion } from "@whereabouts/shared/catalogue/catalogue"
import { PaintedIn } from "./PaintedIn"
import { paintedInTestIds } from "./PaintedInTestIds"
import s from "./PaintedIn.module.css"

const brazil = CATALOGUE.filter(isFlagQuestion).find((f) => f.clue.flag === "br")!

describe("PaintedIn", () => {
  it("shows the flag, the country and the share, marked when it is the answer", () => {
    const { rerender } = render(<PaintedIn where={{ country: brazil, share: 0.62 }} answer="pe" whose="Ann's" />)
    const el = screen.getByTestId(paintedInTestIds.paintedIn)
    expect(el.textContent).toBe("Brazil62%")
    expect(el.getAttribute("title")).toBe("62% of Ann's paint was in Brazil")
    expect(el.classList.contains(s.right!)).toBe(false)
    rerender(<PaintedIn where={{ country: brazil, share: 0.62 }} answer="br" whose="your" />)
    expect(screen.getByTestId(paintedInTestIds.paintedIn).classList.contains(s.right!)).toBe(true)
    expect(screen.getByTestId(paintedInTestIds.paintedIn).getAttribute("title")).toBe(
      "62% of your paint was in Brazil, the answer"
    )
  })
})
