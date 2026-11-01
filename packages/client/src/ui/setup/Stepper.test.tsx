// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { fireEvent, render } from "@testing-library/preact"
import { Stepper } from "./Stepper"

describe("Stepper", () => {
  it("steps within its bounds", () => {
    const onChange = vi.fn()
    const { container, rerender } = render(<Stepper label="Rounds" value={1} min={1} max={15} onChange={onChange} />)
    const fewer = () => container.querySelector<HTMLButtonElement>('[aria-label="Fewer rounds"]')!
    const more = () => container.querySelector<HTMLButtonElement>('[aria-label="More rounds"]')!
    expect(fewer().disabled).toBe(true)
    fireEvent.click(more())
    expect(onChange).toHaveBeenCalledWith(2)
    rerender(<Stepper label="Rounds" value={15} min={1} max={15} onChange={onChange} />)
    expect(more().disabled).toBe(true)
  })
})
