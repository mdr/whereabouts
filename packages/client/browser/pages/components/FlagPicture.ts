import { PageObject } from "../steps.ts"
import { expect, type Locator, type Page } from "@playwright/test"
import { expectNumber } from "../support.ts"
import { Lightbox } from "./Lightbox.ts"

/** A flag shown as a button that enlarges it: the question's, or one in the results. */
export class FlagPicture extends PageObject {
  readonly #page: Page
  readonly #button: Locator

  constructor(page: Page, button: Locator) {
    super()
    this.#page = page
    this.#button = button
  }

  async expectShown(shown: boolean): Promise<void> {
    await expect(this.#button, shown ? "the flag is shown" : "no flag is shown").toHaveCount(shown ? 1 : 0)
  }

  /** The flag's frame is its own shape (width over height). */
  async expectShape(ratio: number): Promise<void> {
    await expectNumber(
      `the flag's frame is ${ratio.toFixed(2)} wide for 1 high`,
      async () => {
        const box = await this.#button.boundingBox()
        return box ? box.width / box.height : 0
      },
      { atLeast: ratio - 0.03, atMost: ratio + 0.03 }
    )
  }

  async enlarge(): Promise<Lightbox> {
    await this.#button.click()
    const lightbox = new Lightbox(this.#page)
    await lightbox.expectOpen()
    return lightbox
  }
}
