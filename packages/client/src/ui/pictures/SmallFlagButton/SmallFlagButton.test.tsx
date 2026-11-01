// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { flagCode } from "@whereabouts/shared/ids"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact"
import { SmallFlagButton } from "./SmallFlagButton"
import lb from "../Lightbox/Lightbox.module.css"
import credit from "../CommonsCredit/CommonsCredit.module.css"
import styles from "./SmallFlagButton.module.css"
import type * as flags from "../../../flags/flags"

vi.mock("../../../flags/flags", async (original) => ({
  ...(await original<typeof flags>()),
  flagUrl: (code: string) => Promise.resolve(`/flags/${code}.svg`)
}))

describe("SmallFlagButton", () => {
  const ratio = (element: unknown) => Number((element as HTMLElement).style.getPropertyValue("--flag-ratio"))
  const enlargedRatio = (element: unknown) => Number((element as HTMLElement).style.getPropertyValue("--ratio"))
  // Nepal's is taller than wide, Switzerland's square, Qatar's the widest.
  const shapes = [
    [flagCode("np"), 0.8203],
    [flagCode("ch"), 1],
    [flagCode("qa"), 2.5455]
  ] as const

  it("takes each flag's own shape in the results, here and enlarged, where the flag is credited", async () => {
    for (const [code, shape] of shapes) {
      const listed = render(<SmallFlagButton code={code} />)
      expect(ratio(listed.container.querySelector(`.${styles.flagPicture} .${styles.flagShape}`))).toBe(shape)
      const button = listed.container.querySelector<HTMLButtonElement>(`.${styles.flagPicture}`)!
      await waitFor(() => expect(button.disabled).toBe(false))
      fireEvent.click(button)
      expect(enlargedRatio(document.body.querySelector(`.${lb.lightbox} img.${lb.flag}`))).toBe(shape)
      expect(document.body.querySelector<HTMLAnchorElement>(`.${lb.lightbox} .${credit.credit}`)!.href).toContain(
        "commons.wikimedia.org"
      )
      cleanup()
    }
  })
})
