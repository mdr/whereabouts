// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { fireEvent, render } from "@testing-library/preact"
import { Pills } from "./Pills"

const options = [
  { value: 30, label: "30" },
  { value: 60, label: "60" }
]

describe("Pills", () => {
  it("marks the current choice and reports a new one", () => {
    const onChange = vi.fn()
    const { container } = render(<Pills label="Seconds" options={options} value={60} onChange={onChange} />)
    const [a, b] = container.querySelectorAll("button")
    expect(b!.getAttribute("aria-checked")).toBe("true")
    expect(a!.getAttribute("aria-checked")).toBe("false")
    fireEvent.click(a!)
    expect(onChange).toHaveBeenCalledWith(30)
  })
})
