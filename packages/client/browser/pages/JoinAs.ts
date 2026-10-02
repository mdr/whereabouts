import type { Page } from "playwright-core";
import { joinAsTestIds } from "../../src/screens/MultiplayerTestIds.ts";

/** The page a game link opens: confirm your name, then join or just watch. */
export class JoinAs {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async enterName(name: string): Promise<void> {
    await this.#page.getByTestId(joinAsTestIds.nameInput).fill(name);
  }

  async join(): Promise<void> {
    await this.#page.getByTestId(joinAsTestIds.joinButton).click();
  }
}
