// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test"
import { render, screen } from "@testing-library/preact"
import { flagCode } from "@whereabouts/shared/ids"
import { lookalikesOf } from "@whereabouts/shared/catalogue/lookalike-flags"
import { LookalikeFlags } from "./LookalikeFlags"
import { lookalikeFlagsTestIds } from "./LookalikeFlagsTestIds"

const shownFlags = () => screen.getAllByTestId(lookalikeFlagsTestIds.flag).map((flag) => flag.textContent)

describe("LookalikeFlags", () => {
  it("sets the look-alike painted beside the answer, each with what marks it apart", () => {
    render(<LookalikeFlags lookalikes={lookalikesOf(flagCode("id"), flagCode("pl"))!} />)
    expect(screen.getByTestId(lookalikeFlagsTestIds.lookalikes).textContent).toContain(
      "Easy to mix up: you painted Poland"
    )
    expect(shownFlags().slice(0, 2)).toEqual(["IndonesiaRed over white, and longer", "PolandWhite over red"])
  })

  it("lists the answer's look-alikes when the paint was right", () => {
    render(<LookalikeFlags lookalikes={lookalikesOf(flagCode("id"), flagCode("id"))!} />)
    expect(screen.getByTestId(lookalikeFlagsTestIds.lookalikes).textContent).toContain("Look-alike flags")
    expect(shownFlags()[0]).toBe("IndonesiaRed over white, and longer")
  })
})
