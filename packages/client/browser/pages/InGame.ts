import type { Page } from "playwright-core";
import { inGameTestIds } from "../../src/screens/InGameTestIds.ts";
import { isUsable, text } from "./support.ts";

/** An online round while guessing: Done (or Pass), and what you're told while you wait. */
export class InGame {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  /** Waits until you can finish this round: it has started and you're playing it. */
  async waitUntilPlaying(timeoutMs = 15_000): Promise<void> {
    await this.#page.getByTestId(inGameTestIds.doneButton).waitFor({ timeout: timeoutMs });
  }

  /** "Done", or "Pass" while nothing is painted. */
  async doneButtonLabel(): Promise<string> {
    return text(this.#page.getByTestId(inGameTestIds.doneButton));
  }

  /** Done with paint, or a pass without. The last player to press it ends the round. */
  async pressDone(): Promise<void> {
    await this.#page.getByTestId(inGameTestIds.doneButton).click();
  }

  /** Done, then waiting for the others. */
  async finish(): Promise<void> {
    await this.pressDone();
    await this.waitUntilFinished();
  }

  async waitUntilFinished(timeoutMs = 5_000): Promise<void> {
    await this.#page.getByTestId(inGameTestIds.doneNote).waitFor({ timeout: timeoutMs });
  }

  async keepEditing(): Promise<void> {
    await this.#page.getByTestId(inGameTestIds.keepEditingButton).click();
    await this.waitUntilPlaying(5_000);
  }

  /** Waits for the notice that a late joiner sits this round out. */
  async waitUntilSittingOut(timeoutMs = 10_000): Promise<void> {
    await this.#page.getByTestId(inGameTestIds.sittingOutNote).waitFor({ timeout: timeoutMs });
  }

  /** Waits until you're either playing this round or sitting it out. */
  async waitUntilInRound(timeoutMs = 10_000): Promise<void> {
    await this.#page
      .getByTestId(inGameTestIds.doneButton)
      .or(this.#page.getByTestId(inGameTestIds.sittingOutNote))
      .waitFor({ timeout: timeoutMs });
  }

  async doneButtonIsUsable(): Promise<boolean> {
    return isUsable(this.#page.getByTestId(inGameTestIds.doneButton));
  }
}
