import type { Page } from "playwright-core";
import { resultsTestIds } from "../../src/screens/ResultsTestIds.ts";

/** The final standings. */
export class Results {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async waitUntilShown(timeoutMs = 10_000): Promise<void> {
    await this.#page.getByTestId(resultsTestIds.page).waitFor({ timeout: timeoutMs });
  }

  /** Player names, winner first. */
  async standings(): Promise<string[]> {
    const rows = await this.#page.getByTestId(resultsTestIds.standingsRow).all();
    return Promise.all(rows.map(async (row) => (await row.getAttribute("data-player")) ?? ""));
  }

  async playAgain(): Promise<void> {
    await this.#page.getByTestId(resultsTestIds.playAgainButton).click();
  }
}
