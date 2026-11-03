import { PageObject } from "../steps.ts"
import { expect, type Locator, type Page } from "@playwright/test"
import { commonsCreditTestIds } from "../../../src/ui/pictures/CommonsCredit/CommonsCreditTestIds.ts"
import { lightboxTestIds } from "../../../src/ui/pictures/Lightbox/LightboxTestIds.ts"
import { expectNumber } from "../support.ts"
import type { Px } from "@whereabouts/shared/units"

/** The ways to leave an enlarged picture. */
export enum LightboxExit {
  ESCAPE = "ESCAPE",
  CLOSE_BUTTON = "CLOSE_BUTTON",
  BACKDROP = "BACKDROP"
}

/** A picture enlarged over the map. */
export class Lightbox extends PageObject {
  readonly #page: Page

  constructor(page: Page) {
    super()
    this.#page = page
  }

  #picture(): Locator {
    return this.#page.getByTestId(lightboxTestIds.picture)
  }

  async expectOpen(): Promise<void> {
    await expect(this.#page.getByTestId(lightboxTestIds.lightbox), "the picture is enlarged").toBeVisible()
  }

  async expectClosed(): Promise<void> {
    await expect(this.#page.getByTestId(lightboxTestIds.lightbox), "the picture is not enlarged").toHaveCount(0)
  }

  async exit(how: LightboxExit): Promise<void> {
    switch (how) {
      case LightboxExit.ESCAPE:
        // The key is heard only once the page has set its listener, a moment after the picture shows.
        await expect(async () => {
          await this.#page.keyboard.press("Escape")
          await expect(this.#page.getByTestId(lightboxTestIds.lightbox)).toHaveCount(0, { timeout: 500 })
        }, "Escape closes the picture").toPass()
        break
      case LightboxExit.CLOSE_BUTTON:
        await this.#page.getByTestId(lightboxTestIds.close).click()
        break
      case LightboxExit.BACKDROP:
        await this.#page.getByTestId(lightboxTestIds.lightbox).click({ position: { x: 5, y: 5 } })
        break
    }
    await this.expectClosed()
  }

  /** Click the picture itself: it toggles between fit and a closer look, and does not close the lightbox. */
  async clickPicture(): Promise<void> {
    await this.#picture().click()
  }

  /** Scroll over the picture; a negative `amount` zooms in. */
  async wheel(amount: Px): Promise<void> {
    await this.#page.getByTestId(lightboxTestIds.frame).hover()
    await this.#page.mouse.wheel(0, amount)
  }

  async #scale(): Promise<number> {
    return this.#picture().evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)
  }

  async #shift(): Promise<number> {
    return this.#picture().evaluate((element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform)
      return Math.abs(matrix.e) + Math.abs(matrix.f)
    })
  }

  async expectScale(scale: number): Promise<void> {
    await expectNumber(`the picture is at ${scale}x`, () => this.#scale(), {
      atLeast: scale - 0.01,
      atMost: scale + 0.01
    })
  }

  /** Zoomed in, but no further than the limit of 6x. */
  async expectZoomedIn(): Promise<void> {
    await expectNumber("the picture is zoomed in, to 6x at most", () => this.#scale(), {
      greaterThan: 1.01,
      atMost: 6.01
    })
  }

  async expectAtFit(): Promise<void> {
    await this.expectScale(1)
    await expectNumber("the picture is back in the middle", () => this.#shift(), { atMost: 0.01 })
  }

  /** The rendition shown is this many pixels wide, as the photo's address asks. */
  async expectPhotoWidth(width: Px): Promise<void> {
    await expect(this.#picture(), `the photo shown is the ${width}px rendition`).toHaveAttribute(
      "src",
      new RegExp(`width=${width}$`)
    )
  }

  /** The picture's box is this shape (width over height), once at fit. */
  async expectShape(ratio: number): Promise<void> {
    await expectNumber(
      `the enlarged picture is ${ratio.toFixed(2)} wide for 1 high`,
      async () => {
        const box = await this.#picture().boundingBox()
        return box ? box.width / box.height : 0
      },
      { atLeast: ratio - 0.02, atMost: ratio + 0.02 }
    )
  }

  async expectCredit(shown: boolean): Promise<void> {
    await expect(
      this.#page.getByTestId(lightboxTestIds.lightbox).getByTestId(commonsCreditTestIds.credit),
      shown ? "the enlarged picture is credited" : "the enlarged picture has no credit link"
    ).toHaveCount(shown ? 1 : 0)
  }

  async expectCreditToCommons(): Promise<void> {
    await expect(
      this.#page.getByTestId(lightboxTestIds.lightbox).getByTestId(commonsCreditTestIds.credit),
      "the credit links to Wikimedia Commons"
    ).toHaveAttribute("href", /^https:\/\/commons\.wikimedia\.org\//)
  }
}
