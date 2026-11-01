// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { fireEvent, render, waitFor } from "@testing-library/preact"
import { QuestionImage } from "./QuestionImage"
import lb from "../../../pictures/Lightbox/Lightbox.module.css"
import commonsCredit from "../../../pictures/CommonsCredit/CommonsCredit.module.css"
import questionImage from "./QuestionImage.module.css"
import enlargeBadge from "../EnlargeBadge/EnlargeBadge.module.css"
import { commonsFile } from "@whereabouts/shared/ids"

const image = commonsFile("Some_file.jpg")

describe("QuestionImage", () => {
  // First in this file: the label shows only on the session's first photo.
  it("says it can be enlarged: a button with a badge, labelled on the first photo only", () => {
    const { container: first } = render(<QuestionImage image={image} credit={false} painting />)
    const button = first.querySelector<HTMLButtonElement>(`.${questionImage.thumbButton}`)!
    expect(button.textContent).toContain("Enlarge photo")
    expect(first.querySelector(`.${enlargeBadge.badge}`)!.textContent).toBe("Enlarge")
    const { container: later } = render(<QuestionImage image={image} credit={false} painting />)
    expect(later.querySelectorAll(`.${enlargeBadge.badge}`)).not.toHaveLength(0)
    expect(later.querySelector(`.${enlargeBadge.badge}`)!.textContent).toBe("")
    fireEvent.click(later.querySelector(`.${questionImage.thumbButton}`)!)
    expect(document.body.querySelectorAll(`.${lb.lightbox}`)).not.toHaveLength(0)
  })

  it("enlarges on click and shrinks on Escape, the close button, or a backdrop click", () => {
    const { container } = render(<QuestionImage image={image} credit={false} painting />)
    expect(document.body.querySelectorAll(`.${lb.lightbox}`)).toHaveLength(0)
    fireEvent.click(container.querySelector(`.${questionImage.thumb} img`)!)
    expect(document.body.querySelectorAll(`.${lb.lightbox} img`)).not.toHaveLength(0)
    fireEvent.keyDown(window, { key: "Escape" })
    expect(document.body.querySelectorAll(`.${lb.lightbox}`)).toHaveLength(0)
    fireEvent.click(container.querySelector(`.${questionImage.thumb} img`)!)
    fireEvent.click(document.body.querySelector(`.${lb.lightbox}`)!)
    expect(document.body.querySelectorAll(`.${lb.lightbox}`)).toHaveLength(0)
    fireEvent.click(container.querySelector(`.${questionImage.thumb} img`)!)
    fireEvent.click(document.body.querySelector(`.${lb.close}`)!)
    expect(document.body.querySelectorAll(`.${lb.lightbox}`)).toHaveLength(0)
  })

  it("zooms the enlarged photo: click toggles a closer look, the wheel zooms in and out", () => {
    const { container } = render(<QuestionImage image={image} credit={false} painting />)
    fireEvent.click(container.querySelector(`.${questionImage.thumb} img`)!)
    const lightboxImage = document.body.querySelector<HTMLImageElement>(`.${lb.lightbox} img`)!
    expect(lightboxImage.style.transform).toContain("scale(1)")
    fireEvent.click(lightboxImage)
    expect(lightboxImage.style.transform).toContain("scale(2.5)")
    expect(document.body.querySelector(`.${lb.frame}`)!.classList.contains(lb.zoomed)).toBe(true)
    // Clicking the picture does not close the lightbox.
    expect(document.body.querySelectorAll(`.${lb.lightbox}`)).not.toHaveLength(0)
    fireEvent.click(lightboxImage)
    expect(lightboxImage.style.transform).toContain("scale(1)")
    fireEvent.wheel(document.body.querySelector(`.${lb.frame}`)!, { deltaY: -500 })
    const scale = Number(/scale\(([\d.]+)\)/.exec(lightboxImage.style.transform)![1])
    expect(scale).toBeGreaterThan(1)
    expect(scale).toBeLessThanOrEqual(6)
    fireEvent.wheel(document.body.querySelector(`.${lb.frame}`)!, { deltaY: 5000 })
    expect(lightboxImage.style.transform).toContain("scale(1)")
    expect(lightboxImage.style.transform).toContain("translate(0px, 0px)")
  })

  it("enlarges at once with the photo the page has, in its shape, then swaps in a larger one, keeping the zoom", async () => {
    let decoded = () => {}
    vi.spyOn(HTMLImageElement.prototype, "decode").mockImplementation(
      () => new Promise<void>((resolve) => (decoded = resolve))
    )
    const { container } = render(<QuestionImage image={image} credit={false} painting />)
    const thumb = container.querySelector<HTMLImageElement>(`.${questionImage.thumb} img`)!
    Object.defineProperty(thumb, "naturalWidth", { value: 900 })
    Object.defineProperty(thumb, "naturalHeight", { value: 600 })
    fireEvent.click(thumb)
    const lightboxImage = document.body.querySelector<HTMLImageElement>(`.${lb.lightbox} img`)!
    expect(lightboxImage.src).toBe(thumb.src)
    expect(lightboxImage.classList.contains(lb.fit)).toBe(true)
    expect(lightboxImage.style.getPropertyValue("--ratio")).toBe("1.5")
    fireEvent.click(lightboxImage)
    decoded()
    await waitFor(() => expect(lightboxImage.src).toContain("width=1600"))
    expect(lightboxImage.style.transform).toContain("scale(2.5)")
    vi.restoreAllMocks()
  })

  it("keeps the Commons credit behind an info icon linking to the file page, only when asked", () => {
    // While guessing there is no credit link at all: the file name is a spoiler.
    const { container: guessing } = render(<QuestionImage image={image} credit={false} painting />)
    expect(guessing.querySelectorAll(`.${commonsCredit.credit}`)).toHaveLength(0)

    const { container } = render(<QuestionImage image={image} credit painting />)
    const credit = container.querySelector<HTMLAnchorElement>(`.${questionImage.thumb} .${commonsCredit.credit}`)!
    expect(credit.href).toContain("commons.wikimedia.org")
    expect(credit.getAttribute("aria-label")).toContain("Wikimedia Commons")
    expect(container.textContent).not.toContain("Wikimedia")
  })
})
