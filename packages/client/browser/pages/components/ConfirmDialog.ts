import { PageObject } from "../steps.ts"
import { expect, type Page } from "@playwright/test"
import { confirmDialogTestIds } from "../../../src/ui/ConfirmDialog/ConfirmDialogTestIds.ts"
import { text } from "../support.ts"

/** The "are you sure?" dialog. Confirming leads to `T`: the screen the action takes you to. */
export class ConfirmDialog<T> extends PageObject {
  readonly #page: Page
  readonly #confirmed: () => Promise<T>

  static async whenShown<T>(page: Page, confirmed: () => Promise<T>): Promise<ConfirmDialog<T>> {
    await expect(page.getByTestId(confirmDialogTestIds.dialog), "the confirmation dialog is shown").toBeVisible()
    return new ConfirmDialog(page, confirmed)
  }

  constructor(page: Page, confirmed: () => Promise<T>) {
    super()
    this.#page = page
    this.#confirmed = confirmed
  }

  async question(): Promise<string> {
    return text(this.#page.getByTestId(confirmDialogTestIds.title))
  }

  /** Back to the screen underneath, unchanged. */
  async cancel(): Promise<void> {
    await this.#page.getByTestId(confirmDialogTestIds.cancelButton).click()
    await expect(this.#page.getByTestId(confirmDialogTestIds.dialog), "Cancel closes the dialog").toBeHidden()
  }

  async confirm(): Promise<T> {
    await this.#page.getByTestId(confirmDialogTestIds.confirmButton).click()
    return this.#confirmed()
  }
}
