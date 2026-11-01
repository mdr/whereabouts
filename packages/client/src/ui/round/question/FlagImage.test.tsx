// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact"
import { FlagImage } from "./FlagImage"
import lb from "../../pictures/Lightbox.module.css"
import commonsCredit from "../../pictures/CommonsCredit.module.css"
import flagImage from "./FlagImage.module.css"
import type * as flags from "../../../flags/flags"

vi.mock("../../../flags/flags", async (original) => ({
  ...(await original<typeof flags>()),
  flagUrl: (code: string) => Promise.resolve(`/flags/${code}.svg`)
}))

describe("flag frames", () => {
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
      const { container } = render(<FlagImage code={code} painting />)
      const button = container.querySelector<HTMLButtonElement>(`.${flagImage.flag!}`)!
      expect(button.querySelectorAll("img")).toHaveLength(0)
      expect(ratio(button)).toBe(shape)
      await waitFor(() => expect(button.disabled).toBe(false))
      fireEvent.click(button)
      expect(enlargedRatio(document.body.querySelector(`.${lb.lightbox!} img.${lb.flag!}`))).toBe(shape)
      // No credit while guessing: the Commons file is named for the country.
      expect(document.body.querySelectorAll(`.${lb.lightbox!} .${commonsCredit.credit!}`)).toHaveLength(0)
      cleanup()
    }
  })
})
