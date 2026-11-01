// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { render } from "@testing-library/preact"
import { HudBottom } from "./Hud"
import h from "./Hud.module.css"

describe("HudBottom", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.documentElement.style.removeProperty("--toolbar-h")
  })

  it("publishes its height as --toolbar-h while mounted", () => {
    // happy-dom has no ResizeObserver and reports zero heights; stub both.
    const observe = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = observe
        disconnect = disconnect
      }
    )
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 96 })
    const { container, unmount } = render(
      <HudBottom>
        <button>Done</button>
      </HudBottom>
    )
    expect(container.querySelector(`.${h.toolbar!} button`)!.textContent).toBe("Done")
    expect(document.documentElement.style.getPropertyValue("--toolbar-h")).toBe("96px")
    expect(observe).toHaveBeenCalledWith(container.firstElementChild)
    unmount()
    expect(disconnect).toHaveBeenCalled()
    expect(document.documentElement.style.getPropertyValue("--toolbar-h")).toBe("")
  })
})
