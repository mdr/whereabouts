import type { Page } from "playwright-core";
import { homeTestIds } from "../../src/screens/HomeTestIds.ts";

/** The front page: your name, then host, join or practise. */
export class Home {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async enterName(name: string): Promise<void> {
    await this.#page.getByTestId(homeTestIds.nameInput).fill(name);
  }

  async hostGame(): Promise<void> {
    await this.#page.getByTestId(homeTestIds.hostButton).click();
  }

  async joinGame(code: string): Promise<void> {
    await this.#page.getByTestId(homeTestIds.codeInput).fill(code);
    await this.#page.getByTestId(homeTestIds.joinButton).click();
  }

  async practise(): Promise<void> {
    await this.#page.getByTestId(homeTestIds.practiseButton).click();
  }

  async waitUntilShown(): Promise<void> {
    await this.#page.getByTestId(homeTestIds.page).waitFor();
  }
}
