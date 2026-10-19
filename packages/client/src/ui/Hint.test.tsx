// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { cleanup, fireEvent, render } from "@testing-library/preact"
import { HintCard } from "./Hint"
import { hintTestIds } from "./HintTestIds"

describe("HintCard", () => {
  afterEach(cleanup)

  it("offers both bands with the count left, and says which was chosen", () => {
    const onUse = vi.fn<(axis: string) => void>()
    const { getByTestId } = render(<HintCard left={2} onUse={onUse} />)
    expect(getByTestId(hintTestIds.card).textContent).toContain("2 left")
    fireEvent.click(getByTestId(hintTestIds.longitude))
    expect(onUse).toHaveBeenCalledWith("longitude")
  })

  it("shows the band once used, and nothing when none are left", () => {
    const used = render(<HintCard band={{ axis: "latitude", from: 23, to: 37 }} left={0} onUse={() => {}} />)
    expect(used.getByTestId(hintTestIds.band).textContent).toContain("Between 23°N and 37°N")
    const none = render(<HintCard left={0} onUse={() => {}} />)
    expect(none.container.querySelectorAll(".hint-card")).toHaveLength(0)
  })

  it("has no count in practice, where hints are unlimited", () => {
    const { getByTestId } = render(<HintCard onUse={() => {}} />)
    expect(getByTestId(hintTestIds.card).textContent).not.toContain("left")
  })
})
