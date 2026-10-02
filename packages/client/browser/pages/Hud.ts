import type { Page } from "playwright-core";
import { hudHeaderTestIds, questionCardTestIds, soundToggleTestIds } from "../../src/ui/bitsTestIds.ts";
import { hostControlsTestIds } from "../../src/ui/HostControlsTestIds.ts";
import { text } from "./support.ts";

/** What sits over the map on every game screen: the header strip and the question. */
export class Hud {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  /** "Round 2 / 3" */
  async round(): Promise<string> {
    return text(this.#page.getByTestId(hudHeaderTestIds.round));
  }

  async toggleSound(): Promise<void> {
    await this.#page.getByTestId(soundToggleTestIds.button).click();
  }

  async prompt(): Promise<string> {
    return text(this.#page.getByTestId(questionCardTestIds.prompt));
  }

  async questionHasPhoto(): Promise<boolean> {
    return (await this.#page.getByTestId(questionCardTestIds.photo).count()) > 0;
  }

  /** Host: opens the confirmation for ending the game early. */
  async askToEndGame(): Promise<void> {
    await this.#page.getByTestId(hostControlsTestIds.endGameButton).click();
  }
}
