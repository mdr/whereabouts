// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vite-plus/test"
import { fireEvent, render } from "@testing-library/preact"
import { DevDrawer, DevFacts } from "./DevDrawer"
import { devMode } from "../dev"
import { devDrawerTestIds } from "./DevDrawerTestIds"

afterEach(() => {
  devMode.value = false
})

describe("DevDrawer", () => {
  it("renders nothing unless dev mode is on", () => {
    const { container } = render(
      <DevDrawer>
        <p>secret</p>
      </DevDrawer>
    )
    expect(container.textContent).toBe("")
  })

  it("shows its children with a badge, and can hide itself", () => {
    devMode.value = true
    const { container, getByText, getByTestId } = render(
      <DevDrawer>
        <DevFacts facts={[["Status", "connected"]]} />
      </DevDrawer>
    )
    expect(getByTestId(devDrawerTestIds.badge).textContent).toBe("DEV")
    expect(container.textContent).toContain("connected")
    fireEvent.click(getByText("Hide"))
    expect(devMode.value).toBe(false)
  })
})
