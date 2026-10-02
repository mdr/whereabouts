import type { Page } from "playwright-core";
import { soloTestIds } from "../../src/screens/SoloTestIds.ts";
import { text } from "./support.ts";

/** Practice on your own: paint, submit, see the score. */
export class Solo {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async waitUntilShown(timeoutMs = 30_000): Promise<void> {
    await this.#page.getByTestId(soloTestIds.submitButton).waitFor({ timeout: timeoutMs });
  }

  async isShown(): Promise<boolean> {
    return (await this.#page.getByTestId(soloTestIds.submitButton).count()) > 0;
  }

  async submit(): Promise<void> {
    await this.#page.getByTestId(soloTestIds.submitButton).click();
  }

  /** The score on the reveal, once shown. */
  async roundScore(): Promise<string> {
    return text(this.#page.getByTestId(soloTestIds.roundScore));
  }
}
