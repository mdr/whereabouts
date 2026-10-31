// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact"
import { QuestionCard } from "./QuestionCard"
import lb from "./Lightbox.module.css"
import pictures from "./Pictures.module.css"
import qc from "./QuestionCard.module.css"
import { flagCode, regionId } from "@whereabouts/shared/ids"
import type * as flags from "../flags"

vi.mock("../flags", async (original) => ({
  ...(await original<typeof flags>()),
  flagUrl: (code: string) => Promise.resolve(`/flags/${code}.svg`)
}))

const q = { prompt: "Where is this?", image: "Some_file.jpg", toleranceKm: 50 }

describe("QuestionCard", () => {
  it("shows the prompt but not the tolerance, which only drives scoring", () => {
    const { container } = render(<QuestionCard hud="painting" q={{ prompt: "Where is Dublin?", toleranceKm: 40 }} />)
    expect(container.textContent).toBe("Where is Dublin?")
  })

  it("shows a country round's flag beside the name, and a flag round's own flag", async () => {
    const country = render(
      <QuestionCard
        hud="painting"
        q={{ prompt: "Paint the whole of Germany", toleranceKm: 65, regionId: regionId("germany-region") }}
        countryFlag={flagCode("de")}
      />
    )
    await waitFor(() =>
      expect(country.container.querySelector(`.${qc.flag!} img`)!.getAttribute("src")).toBe("/flags/de.svg")
    )
    const flagRound = render(
      <QuestionCard
        hud="painting"
        q={{ prompt: "Paint the country with this flag", toleranceKm: 65, flag: flagCode("fr") }}
        countryFlag={flagCode("de")}
      />
    )
    await waitFor(() =>
      expect(flagRound.container.querySelector(`.${qc.flag!} img`)!.getAttribute("src")).toBe("/flags/fr.svg")
    )
    const place = render(<QuestionCard hud="painting" q={{ prompt: "Where is Dublin?", toleranceKm: 40 }} />)
    expect(place.container.querySelectorAll(`.${qc.flag!}`)).toHaveLength(0)
  })
})

describe("flag frames", () => {
  afterEach(() => {
    cleanup()
  })

  const ratio = (el: unknown) => Number((el as HTMLElement).style.getPropertyValue("--flag-ratio"))
  const enlargedRatio = (el: unknown) => Number((el as HTMLElement).style.getPropertyValue("--ratio"))
  // Nepal's is taller than wide, Switzerland's square, Qatar's the widest.
  const shapes = [
    ["np", 0.8203],
    ["ch", 1],
    ["qa", 2.5455]
  ] as const

  it("take each flag's own shape before its picture loads, here and enlarged", async () => {
    for (const [code, shape] of shapes) {
      const { container } = render(
        <QuestionCard
          hud="painting"
          q={{ prompt: "Paint the country with this flag", toleranceKm: 65, flag: flagCode(code) }}
        />
      )
      const button = container.querySelector<HTMLButtonElement>(`.${qc.flag!}`)!
      expect(button.querySelectorAll("img")).toHaveLength(0)
      expect(ratio(button)).toBe(shape)
      await waitFor(() => expect(button.disabled).toBe(false))
      fireEvent.click(button)
      expect(enlargedRatio(document.body.querySelector(`.${lb.lightbox!} img.${lb.flag!}`))).toBe(shape)
      // No credit while guessing: the Commons file is named for the country.
      expect(document.body.querySelectorAll(`.${lb.lightbox!} .${pictures.credit!}`)).toHaveLength(0)
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
    const { container: first } = render(<QuestionCard hud="painting" q={q} />)
    const button = first.querySelector<HTMLButtonElement>(`.${qc.thumbButton!}`)!
    expect(button.textContent).toContain("Enlarge photo")
    expect(first.querySelector(`.${qc.badge!}`)!.textContent).toBe("Enlarge")
    const { container: later } = render(<QuestionCard hud="painting" q={q} />)
    expect(later.querySelectorAll(`.${qc.badge!}`)).not.toHaveLength(0)
    expect(later.querySelector(`.${qc.badge!}`)!.textContent).toBe("")
    fireEvent.click(later.querySelector(`.${qc.thumbButton!}`)!)
    expect(document.body.querySelectorAll(`.${lb.lightbox!}`)).not.toHaveLength(0)
  })

  it("enlarges on click and shrinks on Escape, the close button, or a backdrop click", () => {
    const { container } = render(<QuestionCard hud="painting" q={q} />)
    expect(document.body.querySelectorAll(`.${lb.lightbox!}`)).toHaveLength(0)
    fireEvent.click(container.querySelector(`.${qc.thumb!} img`)!)
    expect(document.body.querySelectorAll(`.${lb.lightbox!} img`)).not.toHaveLength(0)
    fireEvent.keyDown(window, { key: "Escape" })
    expect(document.body.querySelectorAll(`.${lb.lightbox!}`)).toHaveLength(0)
    fireEvent.click(container.querySelector(`.${qc.thumb!} img`)!)
    fireEvent.click(document.body.querySelector(`.${lb.lightbox!}`)!)
    expect(document.body.querySelectorAll(`.${lb.lightbox!}`)).toHaveLength(0)
    fireEvent.click(container.querySelector(`.${qc.thumb!} img`)!)
    fireEvent.click(document.body.querySelector(`.${lb.close!}`)!)
    expect(document.body.querySelectorAll(`.${lb.lightbox!}`)).toHaveLength(0)
  })

  it("zooms the enlarged photo: click toggles a closer look, the wheel zooms in and out", () => {
    const { container } = render(<QuestionCard hud="painting" q={q} />)
    fireEvent.click(container.querySelector(`.${qc.thumb!} img`)!)
    const img = document.body.querySelector<HTMLImageElement>(`.${lb.lightbox!} img`)!
    expect(img.style.transform).toContain("scale(1)")
    fireEvent.click(img)
    expect(img.style.transform).toContain("scale(2.5)")
    expect(document.body.querySelector(`.${lb.frame!}`)!.classList.contains(lb.zoomed!)).toBe(true)
    // Clicking the picture does not close the lightbox.
    expect(document.body.querySelectorAll(`.${lb.lightbox!}`)).not.toHaveLength(0)
    fireEvent.click(img)
    expect(img.style.transform).toContain("scale(1)")
    fireEvent.wheel(document.body.querySelector(`.${lb.frame!}`)!, { deltaY: -500 })
    const scale = Number(/scale\(([\d.]+)\)/.exec(img.style.transform)![1])
    expect(scale).toBeGreaterThan(1)
    expect(scale).toBeLessThanOrEqual(6)
    fireEvent.wheel(document.body.querySelector(`.${lb.frame!}`)!, { deltaY: 5000 })
    expect(img.style.transform).toContain("scale(1)")
    expect(img.style.transform).toContain("translate(0px, 0px)")
  })

  it("enlarges at once with the photo the page has, in its shape, then swaps in a larger one, keeping the zoom", async () => {
    let decoded = () => {}
    vi.spyOn(HTMLImageElement.prototype, "decode").mockImplementation(
      () => new Promise<void>((resolve) => (decoded = resolve))
    )
    const { container } = render(<QuestionCard hud="painting" q={q} />)
    const thumb = container.querySelector<HTMLImageElement>(`.${qc.thumb!} img`)!
    Object.defineProperty(thumb, "naturalWidth", { value: 900 })
    Object.defineProperty(thumb, "naturalHeight", { value: 600 })
    fireEvent.click(thumb)
    const img = document.body.querySelector<HTMLImageElement>(`.${lb.lightbox!} img`)!
    expect(img.src).toBe(thumb.src)
    expect(img.classList.contains(lb.fit!)).toBe(true)
    expect(img.style.getPropertyValue("--ratio")).toBe("1.5")
    fireEvent.click(img)
    decoded()
    await waitFor(() => expect(img.src).toContain("width=1600"))
    expect(img.style.transform).toContain("scale(2.5)")
    vi.restoreAllMocks()
  })

  it("keeps the Commons credit behind an info icon linking to the file page, only when asked", () => {
    // While guessing there is no credit link at all: the file name is a spoiler.
    const { container: guessing } = render(<QuestionCard hud="painting" q={q} />)
    expect(guessing.querySelectorAll(`.${pictures.credit!}`)).toHaveLength(0)

    const { container } = render(<QuestionCard hud="painting" q={q} credit />)
    const credit = container.querySelector<HTMLAnchorElement>(`.${qc.thumb!} .${pictures.credit!}`)!
    expect(credit.href).toContain("commons.wikimedia.org")
    expect(credit.getAttribute("aria-label")).toContain("Wikimedia Commons")
    expect(container.textContent).not.toContain("Wikimedia")
  })
})
