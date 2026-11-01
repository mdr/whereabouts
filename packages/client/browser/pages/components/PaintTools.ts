import { expect, type Page } from "@playwright/test"
import type { Tool } from "../../../src/paint/tool.ts"
import { paintToolsTestIds } from "../../../src/ui/map/paint/PaintTools/PaintToolsTestIds.ts"
import { trimToHintTestIds } from "../../../src/ui/map/paint/TrimToHint/TrimToHintTestIds.ts"
import { byTestIdWith, expectUsable } from "../support.ts"
import type { Ms } from "@whereabouts/shared/units"

/** The brush bar along the bottom of the map. */
export class PaintTools {
  readonly #page: Page

  constructor(page: Page) {
    this.#page = page
  }

  /** Waits until the tools can be used: the round has started and you can paint. */
  async waitUntilEnabled(timeout: Ms = 15_000): Promise<void> {
    await this.#page
      .locator(`[data-testid="${paintToolsTestIds.toolButton}"]:not([disabled])`)
      .first()
      .waitFor({ timeout })
  }

  async selectTool(tool: Tool): Promise<void> {
    await byTestIdWith(this.#page, paintToolsTestIds.toolButton, "tool", tool).click()
  }

  async expectSelectedTool(tool: Tool): Promise<void> {
    await expect(
      byTestIdWith(this.#page, paintToolsTestIds.toolButton, "tool", tool),
      `the ${tool} tool is the one pressed`
    ).toHaveAttribute("aria-pressed", "true")
  }

  /** Tab to the next control, as a keyboard player would, and press it with `key`. */
  async tabOnAndPress(key: "Space" | "Enter"): Promise<void> {
    await this.#page.keyboard.press("Tab")
    await this.#page.keyboard.press(key)
  }

  async clear(): Promise<void> {
    await this.#page.getByTestId(paintToolsTestIds.clearButton).click()
  }

  async trimToHint(): Promise<void> {
    await this.#page.getByTestId(trimToHintTestIds.trimToHintButton).click()
  }

  async undoWithKeyboard(): Promise<void> {
    await this.#page.keyboard.press("Control+z")
  }

  async redoWithKeyboard(): Promise<void> {
    await this.#page.keyboard.press("Control+Shift+z")
  }

  async biggerBrushWithKeyboard(steps = 1): Promise<void> {
    for (let i = 0; i < steps; i++) await this.#page.keyboard.press("]")
  }

  async expectToolUsable(tool: Tool): Promise<void> {
    await expectUsable(
      byTestIdWith(this.#page, paintToolsTestIds.toolButton, "tool", tool),
      `the ${tool} tool is on screen and uncovered`
    )
  }
}
