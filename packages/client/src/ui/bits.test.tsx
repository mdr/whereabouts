// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact"
import { HudBottom, QuestionCard, SmallFlag, SmallFlagButton, SoundToggle } from "./bits"
import { soundOn } from "../settings"
import { flagCode, regionId } from "@whereabouts/shared/ids"
import type * as flags from "../flags"

vi.mock("../flags", async (original) => ({
  ...(await original<typeof flags>()),
  flagUrl: (code: string) => Promise.resolve(`/flags/${code}.svg`)
}))

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
    expect(container.querySelector(".hud-bottom.toolbar button")!.textContent).toBe("Done")
    expect(document.documentElement.style.getPropertyValue("--toolbar-h")).toBe("96px")
    expect(observe).toHaveBeenCalledWith(container.firstElementChild)
    unmount()
    expect(disconnect).toHaveBeenCalled()
    expect(document.documentElement.style.getPropertyValue("--toolbar-h")).toBe("")
  })
})

const q = { prompt: "Where is this?", image: "Some_file.jpg", toleranceKm: 50 }

describe("QuestionCard", () => {
  it("shows the prompt but not the tolerance, which only drives scoring", () => {
    const { container } = render(<QuestionCard q={{ prompt: "Where is Dublin?", toleranceKm: 40 }} />)
    expect(container.textContent).toBe("Where is Dublin?")
  })

  it("shows a country round's flag beside the name, and a flag round's own flag", async () => {
    const country = render(
      <QuestionCard
        q={{ prompt: "Paint the whole of Germany", toleranceKm: 65, regionId: regionId("germany-region") }}
        countryFlag={flagCode("de")}
      />
    )
    await waitFor(() => expect(country.container.querySelector(".flag img")!.getAttribute("src")).toBe("/flags/de.svg"))
    const flagRound = render(
      <QuestionCard
        q={{ prompt: "Paint the country with this flag", toleranceKm: 65, flag: flagCode("fr") }}
        countryFlag={flagCode("de")}
      />
    )
    await waitFor(() =>
      expect(flagRound.container.querySelector(".flag img")!.getAttribute("src")).toBe("/flags/fr.svg")
    )
    const place = render(<QuestionCard q={{ prompt: "Where is Dublin?", toleranceKm: 40 }} />)
    expect(place.container.querySelectorAll(".flag")).toHaveLength(0)
  })
})

describe("flag frames", () => {
  afterEach(() => {
    cleanup()
  })

  const ratio = (el: unknown) => Number((el as HTMLElement).style.getPropertyValue("--flag-ratio"))
  // Nepal's is taller than wide, Switzerland's square, Qatar's the widest.
  const shapes = [
    ["np", 0.8203],
    ["ch", 1],
    ["qa", 2.5455]
  ] as const

  it("take each flag's own shape before its picture loads, here and enlarged", async () => {
    for (const [code, shape] of shapes) {
      const { container } = render(
        <QuestionCard q={{ prompt: "Paint the country with this flag", toleranceKm: 65, flag: flagCode(code) }} />
      )
      const button = container.querySelector<HTMLButtonElement>(".card.question .flag")!
      expect(button.querySelectorAll("img")).toHaveLength(0)
      expect(ratio(button)).toBe(shape)
      await waitFor(() => expect(button.disabled).toBe(false))
      fireEvent.click(button)
      expect(ratio(document.body.querySelector(".lightbox img.lightbox-flag"))).toBe(shape)
      // No credit while guessing: the Commons file is named for the country.
      expect(document.body.querySelectorAll(".lightbox .credit-icon")).toHaveLength(0)
      cleanup()
    }
  })

  it("take each flag's own shape beside a name and in the results, where the flag is credited", async () => {
    for (const [code, shape] of shapes) {
      const small = render(<SmallFlag code={code} />)
      expect(ratio(small.container.querySelector(".small-flag"))).toBe(shape)
      const listed = render(<SmallFlagButton code={code} />)
      expect(ratio(listed.container.querySelector(".small-flag-picture .flag-shape"))).toBe(shape)
      const button = listed.container.querySelector<HTMLButtonElement>(".small-flag-picture")!
      await waitFor(() => expect(button.disabled).toBe(false))
      fireEvent.click(button)
      expect(ratio(document.body.querySelector(".lightbox img.lightbox-flag"))).toBe(shape)
      expect(document.body.querySelector<HTMLAnchorElement>(".lightbox .credit-icon")!.href).toContain(
        "commons.wikimedia.org"
      )
      cleanup()
    }
  })
})

describe("QuestionCard image", () => {
  afterEach(() => {
    cleanup()
  })

  // First in this file: the label shows only on the session's first photo.
  it("says it can be enlarged: a button with a badge, labelled on the first photo only", () => {
    const { container: first } = render(<QuestionCard q={q} />)
    const button = first.querySelector<HTMLButtonElement>(".thumb button.thumb-button")!
    expect(button.textContent).toContain("Enlarge photo")
    expect(first.querySelector(".enlarge-badge")!.textContent).toBe("Enlarge")
    const { container: later } = render(<QuestionCard q={q} />)
    expect(later.querySelectorAll(".enlarge-badge")).not.toHaveLength(0)
    expect(later.querySelector(".enlarge-badge")!.textContent).toBe("")
    fireEvent.click(later.querySelector(".thumb-button")!)
    expect(document.body.querySelectorAll(".lightbox")).not.toHaveLength(0)
  })

  it("enlarges on click and shrinks on Escape, the close button, or a backdrop click", () => {
    const { container } = render(<QuestionCard q={q} />)
    expect(document.body.querySelectorAll(".lightbox")).toHaveLength(0)
    fireEvent.click(container.querySelector(".thumb img")!)
    expect(document.body.querySelectorAll(".lightbox img")).not.toHaveLength(0)
    fireEvent.keyDown(window, { key: "Escape" })
    expect(document.body.querySelectorAll(".lightbox")).toHaveLength(0)
    fireEvent.click(container.querySelector(".thumb img")!)
    fireEvent.click(document.body.querySelector(".lightbox")!)
    expect(document.body.querySelectorAll(".lightbox")).toHaveLength(0)
    fireEvent.click(container.querySelector(".thumb img")!)
    fireEvent.click(document.body.querySelector(".lightbox-close")!)
    expect(document.body.querySelectorAll(".lightbox")).toHaveLength(0)
  })

  it("zooms the enlarged photo: click toggles a closer look, the wheel zooms in and out", () => {
    const { container } = render(<QuestionCard q={q} />)
    fireEvent.click(container.querySelector(".thumb img")!)
    const img = document.body.querySelector<HTMLImageElement>(".lightbox img")!
    expect(img.style.transform).toContain("scale(1)")
    // The lightbox asks for a bigger rendition than the thumbnail.
    expect(img.src).toContain("width=1600")
    fireEvent.click(img)
    expect(img.style.transform).toContain("scale(2.5)")
    expect(document.body.querySelector(".lightbox-frame")!.className).toContain("zoomed")
    // Clicking the picture does not close the lightbox.
    expect(document.body.querySelectorAll(".lightbox")).not.toHaveLength(0)
    fireEvent.click(img)
    expect(img.style.transform).toContain("scale(1)")
    fireEvent.wheel(document.body.querySelector(".lightbox-frame")!, { deltaY: -500 })
    const scale = Number(/scale\(([\d.]+)\)/.exec(img.style.transform)![1])
    expect(scale).toBeGreaterThan(1)
    expect(scale).toBeLessThanOrEqual(6)
    fireEvent.wheel(document.body.querySelector(".lightbox-frame")!, { deltaY: 5000 })
    expect(img.style.transform).toContain("scale(1)")
    expect(img.style.transform).toContain("translate(0px, 0px)")
  })

  it("keeps the Commons credit behind an info icon linking to the file page, only when asked", () => {
    // While guessing there is no credit link at all: the file name is a spoiler.
    const { container: guessing } = render(<QuestionCard q={q} />)
    expect(guessing.querySelectorAll(".credit-icon")).toHaveLength(0)

    const { container } = render(<QuestionCard q={q} credit />)
    const credit = container.querySelector<HTMLAnchorElement>(".thumb .credit-icon")!
    expect(credit.href).toContain("commons.wikimedia.org")
    expect(credit.getAttribute("aria-label")).toContain("Wikimedia Commons")
    expect(container.textContent).not.toContain("Wikimedia")
  })
})

describe("SoundToggle", () => {
  it("flips the per-device sound setting and shows which state it is in", () => {
    soundOn.value = true
    const { container } = render(<SoundToggle />)
    const button = container.querySelector<HTMLButtonElement>(".sound-toggle")!
    expect(button.getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(button)
    expect(soundOn.value).toBe(false)
    expect(button.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(button)
    expect(soundOn.value).toBe(true)
  })
})
