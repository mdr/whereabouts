import { PageObject } from "../steps.ts"
import { expect, type Page } from "@playwright/test"
import { devDrawerTestIds } from "../../../src/ui/dev/DevDrawer/DevDrawerTestIds.ts"
import { paintBlobsTestIds } from "../../../src/ui/map/paint/PaintBlobs/PaintBlobsTestIds.ts"

/** The playtest drawer that `?dev` adds on the right. */
export class DevDrawer extends PageObject {
  readonly #page: Page

  constructor(page: Page) {
    super()
    this.#page = page
  }

  /** The share of paint in each blob, as one line. */
  async blobs(): Promise<string> {
    const lines = await this.#page.getByTestId(paintBlobsTestIds.blobs).innerText()
    return lines.replace(/\s+/g, " ")
  }

  async expectShown(): Promise<void> {
    await expect(this.#page.getByTestId(devDrawerTestIds.badge), "the dev drawer is shown").toHaveText("DEV")
  }

  async hide(): Promise<void> {
    await this.#page.getByTestId(devDrawerTestIds.drawer).getByRole("button", { name: "Hide" }).click()
  }

  async expectAbsent(): Promise<void> {
    await expect(this.#page.getByTestId(devDrawerTestIds.drawer), "there is no dev drawer").toHaveCount(0)
  }
}
