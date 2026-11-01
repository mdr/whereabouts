// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { fireEvent, render } from "@testing-library/preact"
import { HintCard } from "./Hint"
import { hintTestIds } from "./HintTestIds"
import { HintAxis } from "@whereabouts/shared/hints"

describe("HintCard", () => {
  it("offers both bands with the count left, and says which was chosen", () => {
    const onUse = vi.fn<(axis: string) => void>()
    const { getByTestId } = render(<HintCard left={2} onUse={onUse} />)
    expect(getByTestId(hintTestIds.card).textContent).toContain("2 left")
    fireEvent.click(getByTestId(hintTestIds.longitude))
    expect(onUse).toHaveBeenCalledWith(HintAxis.LONGITUDE)
  })

  it("shows the band once used, and nothing when none are left", () => {
    const used = render(<HintCard band={{ axis: HintAxis.LATITUDE, from: 23, to: 37 }} left={0} onUse={() => {}} />)
    expect(used.getByTestId(hintTestIds.band).textContent).toContain("Between 23°N and 37°N")
    const none = render(<HintCard left={0} onUse={() => {}} />)
    expect(none.container.childElementCount).toBe(0)
  })

  it("has no count in practice, where hints are unlimited", () => {
    const { getByTestId } = render(<HintCard onUse={() => {}} />)
    expect(getByTestId(hintTestIds.card).textContent).not.toContain("left")
  })
})
