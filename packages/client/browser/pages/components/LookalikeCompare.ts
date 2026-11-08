import { PageObject } from "../steps.ts"
import { expect, type Locator, type Page } from "@playwright/test"
import { lookalikeCompareTestIds } from "../../../src/ui/round/flag-reveal/LookalikeCompare/LookalikeCompareTestIds.ts"
import { LightboxExit } from "./Lightbox.ts"
import { expectNumber } from "../support.ts"
import type { Px } from "@whereabouts/shared/units"

/** A flag round's look-alikes, shown large together over the reveal. */
export class LookalikeCompare extends PageObject {
  readonly #page: Page

  constructor(page: Page) {
    super()
    this.#page = page
  }

  #dialog(): Locator {
    return this.#page.getByTestId(lookalikeCompareTestIds.dialog)
  }

  async expectOpen(): Promise<void> {
    await expect(this.#dialog(), "the look-alike flags are shown large").toBeVisible()
  }

  async expectClosed(): Promise<void> {
    await expect(this.#dialog(), "the look-alike flags are not shown large").toHaveCount(0)
  }

  /** The flags' names and tips, in order. */
  async expectFlags(flags: string[]): Promise<void> {
    await expect(this.#dialog().getByTestId(lookalikeCompareTestIds.flag), "the flags shown large").toHaveText(
      flags.map((flag) => new RegExp(`^${flag}`))
    )
  }

  /** Each flag is at least this tall. */
  async expectFlagsAtLeast(height: Px): Promise<void> {
    await expectNumber(
      `every flag is at least ${height}px tall`,
      async () => {
        const boxes = await this.#dialog()
          .getByTestId(lookalikeCompareTestIds.flag)
          .evaluateAll((items) => items.map((item) => item.firstElementChild!.getBoundingClientRect().height))
        return Math.min(...boxes)
      },
      { atLeast: height }
    )
  }

  async exit(how: LightboxExit): Promise<void> {
    switch (how) {
      case LightboxExit.ESCAPE:
        await this.#page.keyboard.press("Escape")
        break
      case LightboxExit.CLOSE_BUTTON:
        await this.#dialog().getByTestId(lookalikeCompareTestIds.close).click()
        break
      case LightboxExit.BACKDROP:
        await this.#dialog().click({ position: { x: 5, y: 5 } })
        break
    }
    await this.expectClosed()
  }
}
