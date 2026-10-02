import type { Page } from "playwright-core";
import type { Tool } from "../../src/paint-controller.ts";
import { paintToolsTestIds } from "../../src/ui/PaintToolsTestIds.ts";
import { byTestIdWith, isUsable } from "./support.ts";

/** The brush bar along the bottom of the map. */
export class PaintTools {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  /** Waits until the tools can be used: the round has started and you can paint. */
  async waitUntilEnabled(timeoutMs = 15_000): Promise<void> {
    await this.#page
      .locator(`[data-testid="${paintToolsTestIds.toolButton}"]:not([disabled])`)
      .first()
      .waitFor({ timeout: timeoutMs });
  }

  async selectTool(tool: Tool): Promise<void> {
    await byTestIdWith(this.#page, paintToolsTestIds.toolButton, "tool", tool).click();
  }

  async clear(): Promise<void> {
    await this.#page.getByTestId(paintToolsTestIds.clearButton).click();
  }

  async undoWithKeyboard(): Promise<void> {
    await this.#page.keyboard.press("Control+z");
  }

  async redoWithKeyboard(): Promise<void> {
    await this.#page.keyboard.press("Control+Shift+z");
  }

  async biggerBrushWithKeyboard(steps = 1): Promise<void> {
    for (let i = 0; i < steps; i++) await this.#page.keyboard.press("]");
  }

  async toolIsUsable(tool: Tool): Promise<boolean> {
    return isUsable(byTestIdWith(this.#page, paintToolsTestIds.toolButton, "tool", tool));
  }
}
