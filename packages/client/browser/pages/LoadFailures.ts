import { PageObject } from "./steps.ts"
import { expect, type Page } from "@playwright/test"
import { mapViewTestIds } from "../../src/ui/map/MapView/MapViewTestIds.ts"
import { loadingOutlinesTestIds } from "../../src/ui/map/LoadingOutlines/LoadingOutlinesTestIds.ts"
import { vrButtonTestIds } from "../../src/ui/VrButton/VrButtonTestIds.ts"
import { stillTrueFor } from "./support.ts"
import type { Ms } from "@whereabouts/shared/units"

/** What a screen shows when the map, the outlines or VR will not load. */
export class LoadFailures extends PageObject {
  readonly #page: Page

  constructor(page: Page) {
    super()
    this.#page = page
  }

  async expectMapFailure(timeout: Ms = 20_000): Promise<void> {
    await expect(this.#page.getByTestId(mapViewTestIds.failed), "a map style that will not load says so").toBeVisible({
      timeout
    })
  }

  async retryMap(): Promise<void> {
    await this.#page.getByTestId(mapViewTestIds.retryButton).click()
  }

  async expectOutlinesFailure(timeout: Ms = 20_000): Promise<void> {
    await expect(
      this.#page.getByTestId(loadingOutlinesTestIds.failed),
      "outlines that will not load say so"
    ).toBeVisible({ timeout })
  }

  async retryOutlines(): Promise<void> {
    await this.#page.getByTestId(loadingOutlinesTestIds.retryButton).click()
  }

  async pressVr(): Promise<void> {
    await this.#page.getByTestId(vrButtonTestIds.button).click()
  }

  async expectVrFailure(timeout: Ms = 30_000): Promise<void> {
    await expect(this.#page.getByTestId(vrButtonTestIds.failed), "VR that will not load says so").toBeVisible({
      timeout
    })
  }

  /** Trying again cannot work when the VR code itself would not load, so a reload is offered. */
  async expectVrOffersReload(): Promise<void> {
    await this.expectVrFailure()
    await expect(
      this.#page.getByTestId(vrButtonTestIds.reloadButton),
      "VR code that will not load offers a reload"
    ).toBeVisible()
  }

  async retryVr(): Promise<void> {
    await this.#page.getByTestId(vrButtonTestIds.retryButton).click()
  }

  /** Canvases on the page: a failed VR start must not leave its own behind. */
  async canvases(): Promise<number> {
    return this.#page.locator("canvas").count()
  }

  /** The failure is shown and the page keeps `canvases` canvases, not more, for `duration`. */
  async expectNoCanvasLeftBehind(canvases: number, duration: Ms = 500): Promise<void> {
    await expect(this.#page.getByTestId(vrButtonTestIds.failed), "the VR failure is shown").toBeVisible()
    await stillTrueFor(
      "a failed VR start leaving no canvas behind",
      duration,
      () => this.canvases(),
      (now) => now === canvases
    )
  }
}
