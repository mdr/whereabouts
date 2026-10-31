// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact"
import { SmallFlag, SmallFlagButton, SmallPhoto } from "./Pictures"
import { QuestionCard } from "./QuestionCard"
import lb from "./Lightbox.module.css"
import pictures from "./Pictures.module.css"
import qc from "./QuestionCard.module.css"
import type * as flags from "../flags"

vi.mock("../flags", async (original) => ({
  ...(await original<typeof flags>()),
  flagUrl: (code: string) => Promise.resolve(`/flags/${code}.svg`)
}))

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

  it("take each flag's own shape beside a name and in the results, where the flag is credited", async () => {
    for (const [code, shape] of shapes) {
      const small = render(<SmallFlag code={code} />)
      expect(ratio(small.container.querySelector(`.${pictures.smallFlag!}`))).toBe(shape)
      const listed = render(<SmallFlagButton code={code} />)
      expect(ratio(listed.container.querySelector(`.${pictures.flagPicture!} .${pictures.flagShape!}`))).toBe(shape)
      const button = listed.container.querySelector<HTMLButtonElement>(`.${pictures.flagPicture!}`)!
      await waitFor(() => expect(button.disabled).toBe(false))
      fireEvent.click(button)
      expect(enlargedRatio(document.body.querySelector(`.${lb.lightbox!} img.${lb.flag!}`))).toBe(shape)
      expect(document.body.querySelector<HTMLAnchorElement>(`.${lb.lightbox!} .${pictures.credit!}`)!.href).toContain(
        "commons.wikimedia.org"
      )
      cleanup()
    }
  })
})

describe("SmallPhoto", () => {
  afterEach(() => {
    cleanup()
  })

  it("shows the rounds' rendition of the photo, which the page already has", () => {
    const q = { prompt: "Where is this?", image: "Some_file.jpg", toleranceKm: 50 }
    const { container } = render(<SmallPhoto image="Some_file.jpg" />)
    const shown = render(<QuestionCard hud="painting" q={q} />).container.querySelector<HTMLImageElement>(
      `.${qc.thumb!} img`
    )!
    expect(container.querySelector<HTMLImageElement>(`.${pictures.smallPicture!} img`)!.src).toBe(shown.src)
  })
})
