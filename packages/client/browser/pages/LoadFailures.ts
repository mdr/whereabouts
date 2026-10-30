import type { Page } from "playwright-core"
import { mapViewTestIds } from "../../src/ui/MapViewTestIds.ts"
import { loadingOutlinesTestIds } from "../../src/ui/LoadingOutlinesTestIds.ts"

/** What a screen shows when the map or the outlines will not load. */
export class LoadFailures {
  readonly #page: Page

  constructor(page: Page) {
    this.#page = page
  }

  async mapFailureShown(timeoutMs = 20_000): Promise<boolean> {
    return this.#shown(mapViewTestIds.failed, timeoutMs)
  }

  async retryMap(): Promise<void> {
    await this.#page.getByTestId(mapViewTestIds.retryButton).click()
  }

  async outlinesFailureShown(timeoutMs = 20_000): Promise<boolean> {
    return this.#shown(loadingOutlinesTestIds.failed, timeoutMs)
  }

  async retryOutlines(): Promise<void> {
    await this.#page.getByTestId(loadingOutlinesTestIds.retryButton).click()
  }

  async #shown(testId: string, timeoutMs: number): Promise<boolean> {
    try {
      await this.#page.getByTestId(testId).waitFor({ timeout: timeoutMs })
      return true
    } catch {
      return false
    }
  }
}
