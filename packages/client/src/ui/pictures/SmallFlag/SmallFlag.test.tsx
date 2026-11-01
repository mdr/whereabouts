// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { flagCode } from "@whereabouts/shared/ids"
import { cleanup, render } from "@testing-library/preact"
import { SmallFlag } from "./SmallFlag"
import styles from "./SmallFlag.module.css"
import type * as flags from "../../../flags/flags"

vi.mock("../../../flags/flags", async (original) => ({
  ...(await original<typeof flags>()),
  flagUrl: (code: string) => Promise.resolve(`/flags/${code}.svg`)
}))

describe("SmallFlag", () => {
  // Nepal's is taller than wide, Switzerland's square, Qatar's the widest.
  const shapes = [
    [flagCode("np"), 0.8203],
    [flagCode("ch"), 1],
    [flagCode("qa"), 2.5455]
  ] as const

  it("takes each flag's own shape beside a name", () => {
    for (const [code, shape] of shapes) {
      const { container } = render(<SmallFlag code={code} />)
      const frame = container.querySelector<HTMLElement>(`.${styles.smallFlag}`)!
      expect(Number(frame.style.getPropertyValue("--flag-ratio"))).toBe(shape)
      cleanup()
    }
  })
})
