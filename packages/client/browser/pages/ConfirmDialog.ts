import type { Page } from "playwright-core";
import { confirmDialogTestIds } from "../../src/ui/ConfirmDialogTestIds.ts";
import { text } from "./support.ts";

/** The "are you sure?" dialog. Confirming leads to `T`: the screen the action takes you to. */
export class ConfirmDialog<T> {
  readonly #page: Page;
  readonly #confirmed: () => Promise<T>;

  static async whenShown<T>(page: Page, confirmed: () => Promise<T>): Promise<ConfirmDialog<T>> {
    await page.getByTestId(confirmDialogTestIds.dialog).waitFor();
    return new ConfirmDialog(page, confirmed);
  }

  constructor(page: Page, confirmed: () => Promise<T>) {
    this.#page = page;
    this.#confirmed = confirmed;
  }

  async question(): Promise<string> {
    return text(this.#page.getByTestId(confirmDialogTestIds.title));
  }

  /** Back to the screen underneath, unchanged. */
  async cancel(): Promise<void> {
    await this.#page.getByTestId(confirmDialogTestIds.cancelButton).click();
    await this.#page.getByTestId(confirmDialogTestIds.dialog).waitFor({ state: "detached" });
  }

  async confirm(): Promise<T> {
    await this.#page.getByTestId(confirmDialogTestIds.confirmButton).click();
    return this.#confirmed();
  }
}
