import type { Page } from "playwright-core"
import { paintDevTestIds } from "../../src/ui/PaintToolsTestIds.ts"

/** The playtest drawer that `?dev` adds on the right. */
export class DevDrawer {
  readonly #page: Page

  constructor(page: Page) {
    this.#page = page
  }

  /** The share of paint in each blob, as one line. */
  async blobs(): Promise<string> {
    const lines = await this.#page.getByTestId(paintDevTestIds.blobs).innerText()
    return lines.replace(/\s+/g, " ")
  }
}
