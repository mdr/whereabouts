import { expect } from "@playwright/test"
import { PageObject } from "../steps.ts"
import type { Page } from "@playwright/test"
import { shortcutsTestIds } from "../../../src/ui/map/Shortcuts/ShortcutsTestIds.ts"
import { shortcutsButtonTestIds } from "../../../src/ui/map/ShortcutsButton/ShortcutsButtonTestIds.ts"

/** The keyboard shortcuts card over the map, and the toolbar button that opens it. */
export class Shortcuts extends PageObject {
  readonly #page: Page

  constructor(page: Page) {
    super()
    this.#page = page
  }

  async pressQuestionMark(): Promise<void> {
    await this.#page.keyboard.press("Shift+Slash")
  }

  async pressEscape(): Promise<void> {
    await this.#page.keyboard.press("Escape")
  }

  async clickToolbarButton(): Promise<void> {
    await this.#page.getByTestId(shortcutsButtonTestIds.button).click()
  }

  async clickInsideCard(): Promise<void> {
    await this.#page.getByTestId(shortcutsTestIds.card).click()
  }

  /** A click on the dimmed area beside the card. */
  async clickOutsideCard(): Promise<void> {
    await this.#page.getByTestId(shortcutsTestIds.backdrop).click({ position: { x: 2, y: 2 } })
  }

  async expectOpen(): Promise<void> {
    await expect(this.#page.getByTestId(shortcutsTestIds.card), "the shortcuts card is open").toBeVisible()
  }

  async expectClosed(): Promise<void> {
    await expect(this.#page.getByTestId(shortcutsTestIds.card), "the shortcuts card is closed").toHaveCount(0)
  }
}
