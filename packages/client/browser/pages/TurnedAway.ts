import type { Page } from "playwright-core";
import { joinedTestIds } from "../../src/screens/MultiplayerTestIds.ts";

/** What a player sees when they can't be in the game, e.g. after the host removes them. */
export class TurnedAway {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  /** Waits for the page and returns its headline. */
  async waitForReason(timeoutMs = 10_000): Promise<string> {
    const title = this.#page.getByTestId(joinedTestIds.problemTitle);
    await title.waitFor({ timeout: timeoutMs });
    return (await title.textContent()) ?? "";
  }

  async backToStart(): Promise<void> {
    await this.#page.getByTestId(joinedTestIds.backToStartButton).click();
  }
}
