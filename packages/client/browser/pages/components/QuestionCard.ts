import { PageObject } from "../steps.ts"
import { expect, type Locator, type Page } from "@playwright/test"
import { commonsCreditTestIds } from "../../../src/ui/pictures/CommonsCredit/CommonsCreditTestIds.ts"
import { enlargeBadgeTestIds } from "../../../src/ui/round/question/EnlargeBadge/EnlargeBadgeTestIds.ts"
import { flagImageTestIds } from "../../../src/ui/round/question/FlagImage/FlagImageTestIds.ts"
import { questionCardTestIds } from "../../../src/ui/round/question/QuestionCard/QuestionCardTestIds.ts"
import { questionImageTestIds } from "../../../src/ui/round/question/QuestionImage/QuestionImageTestIds.ts"
import { FlagPicture } from "./FlagPicture.ts"
import { Lightbox } from "./Lightbox.ts"

/** The question over the map: its prompt, its photo or flag. */
export class QuestionCard extends PageObject {
  readonly #page: Page
  readonly flag: FlagPicture
  #release: (() => void) | undefined = undefined

  constructor(page: Page) {
    super()
    this.#page = page
    this.flag = new FlagPicture(page, this.#card().getByTestId(flagImageTestIds.flag))
  }

  #card(): Locator {
    return this.#page.getByTestId(questionCardTestIds.card)
  }

  #photo(): Locator {
    return this.#card().getByTestId(questionImageTestIds.photo)
  }

  /** The photo's badge says "Enlarge", as it does on the session's first photo, or is just an icon. */
  async expectEnlargeLabel(shown: boolean): Promise<void> {
    await expect(this.#photo(), "the question has a photo").toBeVisible()
    await expect(
      this.#photo().getByTestId(enlargeBadgeTestIds.label),
      shown ? "the photo's badge says Enlarge" : "the photo's badge is just an icon"
    ).toHaveCount(shown ? 1 : 0)
  }

  async enlargePhoto(): Promise<Lightbox> {
    await this.#photo().click()
    const lightbox = new Lightbox(this.#page)
    await lightbox.expectOpen()
    return lightbox
  }

  /** While guessing the Commons file name would give the answer away, so there is no credit link. */
  async expectPhotoCredit(shown: boolean): Promise<void> {
    await expect(
      this.#photo().getByTestId(commonsCreditTestIds.credit),
      shown ? "the photo is credited" : "the photo has no credit link"
    ).toHaveCount(shown ? 1 : 0)
  }

  async expectPhotoCreditToCommons(): Promise<void> {
    const credit = this.#photo().getByTestId(commonsCreditTestIds.credit)
    await expect(credit, "the credit links to the file on Wikimedia Commons").toHaveAttribute(
      "href",
      /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/
    )
    await expect(credit, "the credit says where the photo is from").toHaveAttribute("aria-label", /Wikimedia Commons/)
  }

  /** Hold back the larger rendition of photos, so the enlarged photo stays the thumbnail's until released. */
  async holdLargePhotos(): Promise<void> {
    this.#release = await holdRequests(this.#page, /width=1600/)
  }

  async releaseLargePhotos(): Promise<void> {
    this.#release?.()
    this.#release = undefined
  }
}

const holdRequests = async (page: Page, pattern: RegExp): Promise<() => void> => {
  let release = (): void => undefined
  const released = new Promise<void>((resolve) => (release = resolve))
  await page.route(pattern, async (route) => {
    await released
    await route.fallback()
  })
  return release
}
