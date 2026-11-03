import { PageObject } from "../steps.ts"
import { expect, type Locator, type Page } from "@playwright/test"
import { confirmDialogTestIds } from "../../../src/ui/ConfirmDialog/ConfirmDialogTestIds.ts"
import { expectPolled } from "../support.ts"

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

  #dialog(): Locator {
    return this.#page.getByTestId(confirmDialogTestIds.dialog)
  }

  async expectQuestion(question: string): Promise<void> {
    await expect(this.#page.getByTestId(confirmDialogTestIds.title), "the dialog asks the question").toHaveText(
      question
    )
  }

  /** A transformed ancestor (the bottom toolbar) must not shrink the backdrop to its own box. */
  async expectCoversViewport(): Promise<void> {
    const { width, height } = this.#page.viewportSize() ?? { width: -1, height: -1 }
    await expectPolled(
      "the dialog's backdrop covers the whole viewport",
      "the viewport",
      () => this.#page.getByTestId(confirmDialogTestIds.backdrop).boundingBox(),
      (box) => box?.x === 0 && box.y === 0 && box.width === width && box.height === height
    )
  }

  /** Clicking the dialog itself is not clicking away. */
  async clickInside(): Promise<void> {
    await this.#dialog().click({ position: { x: 4, y: 4 } })
    await expect(this.#dialog(), "clicking inside keeps the dialog open").toBeVisible()
  }

  /** The dialog's wording includes this. */
  async expectText(wording: string): Promise<void> {
    await expect(this.#page.getByTestId(confirmDialogTestIds.dialog), `the dialog says "${wording}"`).toContainText(
      wording
    )
  }

  /** Back to the screen underneath, unchanged. */
  async cancel(): Promise<void> {
    await this.#page.getByTestId(confirmDialogTestIds.cancelButton).click()
    await this.#expectClosed("Cancel")
  }

  async dismissWithEscape(): Promise<void> {
    await this.#page.keyboard.press("Escape")
    await this.#expectClosed("Escape")
  }

  async dismissWithBackdrop(): Promise<void> {
    await this.#page.getByTestId(confirmDialogTestIds.backdrop).click({ position: { x: 4, y: 4 } })
    await this.#expectClosed("Clicking the backdrop")
  }

  async confirm(): Promise<T> {
    await this.#page.getByTestId(confirmDialogTestIds.confirmButton).click()
    await this.#expectClosed("Confirming")
    return this.#confirmed()
  }

  async #expectClosed(how: string): Promise<void> {
    await expect(this.#dialog(), `${how} closes the dialog`).toBeHidden()
  }
}
