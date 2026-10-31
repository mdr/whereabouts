import type { Page } from "playwright-core"
import { mapViewTestIds } from "../../src/ui/MapViewTestIds.ts"
import { loadingOutlinesTestIds } from "../../src/ui/LoadingOutlinesTestIds.ts"
import { vrButtonTestIds } from "../../src/ui/VrButtonTestIds.ts"
import type { Ms } from "@whereabouts/shared/units"

/** What a screen shows when the map, the outlines or VR will not load. */
export class LoadFailures {
  readonly #page: Page

  constructor(page: Page) {
    this.#page = page
  }

  async mapFailureShown(timeout: Ms = 20_000): Promise<boolean> {
    return this.#shown(mapViewTestIds.failed, timeout)
  }

  async retryMap(): Promise<void> {
    await this.#page.getByTestId(mapViewTestIds.retryButton).click()
  }

  async outlinesFailureShown(timeout: Ms = 20_000): Promise<boolean> {
    return this.#shown(loadingOutlinesTestIds.failed, timeout)
  }

  async retryOutlines(): Promise<void> {
    await this.#page.getByTestId(loadingOutlinesTestIds.retryButton).click()
  }

  async pressVr(): Promise<void> {
    await this.#page.getByTestId(vrButtonTestIds.button).click()
  }

  async vrFailureShown(timeout: Ms = 30_000): Promise<boolean> {
    return this.#shown(vrButtonTestIds.failed, timeout)
  }

  async vrOffersReload(): Promise<boolean> {
    return this.#page.getByTestId(vrButtonTestIds.reloadButton).isVisible()
  }

  async retryVr(): Promise<void> {
    await this.#page.getByTestId(vrButtonTestIds.retryButton).click()
  }

  /** Canvases on the page: a failed VR start must not leave its own behind. */
  async canvases(): Promise<number> {
    return this.#page.locator("canvas").count()
  }

  async #shown(testId: string, timeout: Ms): Promise<boolean> {
    try {
      await this.#page.getByTestId(testId).waitFor({ timeout })
      return true
    } catch {
      return false
    }
  }
}
