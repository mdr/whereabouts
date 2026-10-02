import type { Page } from "playwright-core";
import { confirmDialogTestIds } from "../../src/ui/ConfirmDialogTestIds.ts";
import { text } from "./support.ts";

/** The "are you sure?" dialog before removing a player, ending the game and the like. */
export class ConfirmDialog {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  /** Waits for the dialog and returns its question. */
  async waitForQuestion(): Promise<string> {
    await this.#page.getByTestId(confirmDialogTestIds.dialog).waitFor();
    return text(this.#page.getByTestId(confirmDialogTestIds.title));
  }

  async cancel(): Promise<void> {
    await this.#page.getByTestId(confirmDialogTestIds.cancelButton).click();
    await this.#page.getByTestId(confirmDialogTestIds.dialog).waitFor({ state: "detached" });
  }

  async confirm(): Promise<void> {
    await this.#page.getByTestId(confirmDialogTestIds.confirmButton).click();
  }
}
