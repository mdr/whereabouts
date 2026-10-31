// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { fireEvent, render } from "@testing-library/preact"
import { HudBottom, SoundToggle } from "./Hud"
import h from "./Hud.module.css"
import { soundOn } from "../settings"

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

describe("SoundToggle", () => {
  it("flips the per-device sound setting and shows which state it is in", () => {
    soundOn.value = true
    const { container } = render(<SoundToggle />)
    const button = container.querySelector<HTMLButtonElement>(`.${h.soundToggle!}`)!
    expect(button.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(button)
    expect(soundOn.value).toBe(false)
    expect(button.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(button)
    expect(soundOn.value).toBe(true)
  })
})
