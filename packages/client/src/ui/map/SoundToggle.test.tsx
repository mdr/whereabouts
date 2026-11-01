// @vitest-environment happy-dom
import { describe, expect, it } from "vite-plus/test"
import { fireEvent, render } from "@testing-library/preact"
import { SoundToggle } from "./SoundToggle"
import s from "./SoundToggle.module.css"
import { soundOn } from "../../settings/settings"

describe("SoundToggle", () => {
  it("flips the per-device sound setting and shows which state it is in", () => {
    soundOn.value = true
    const { container } = render(<SoundToggle />)
    const button = container.querySelector<HTMLButtonElement>(`.${s.soundToggle!}`)!
    expect(button.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(button)
    expect(soundOn.value).toBe(false)
    expect(button.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(button)
    expect(soundOn.value).toBe(true)
  })
})
