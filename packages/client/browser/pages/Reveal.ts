import type { Page } from "playwright-core";
import { revealTestIds } from "../../src/screens/RevealTestIds.ts";
import { byTestIdWith, isUsable, text, until } from "./support.ts";

export interface RevealRow {
  name: string;
  /** "+412", or "sat out". */
  roundScore: string;
  passed: boolean;
}

/** An online round's reveal: the answer, everyone's scores, and getting ready for the next. */
export class Reveal {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async waitUntilShown(timeoutMs = 10_000): Promise<void> {
    await this.#page.getByTestId(revealTestIds.scoresList).waitFor({ timeout: timeoutMs });
  }

  async isShown(): Promise<boolean> {
    return (await this.#page.getByTestId(revealTestIds.scoresList).count()) > 0;
  }

  /** The players' rows, in the order shown. */
  async rows(): Promise<RevealRow[]> {
    const rows = await this.#page.getByTestId(revealTestIds.playerRow).all();
    return Promise.all(
      rows.map(async (row) => ({
        name: await text(row.getByTestId(revealTestIds.playerName)),
        roundScore: await text(row.getByTestId(revealTestIds.roundScore)),
        passed: (await row.getByTestId(revealTestIds.passedTag).count()) > 0,
      })),
    );
  }

  /** Show just this player's paint. */
  async showOnly(name: string): Promise<void> {
    await byTestIdWith(this.#page, revealTestIds.playerRow, "player", name).click();
  }

  /** Hide everyone's paint, or bring it back if hidden. */
  async toggleHidePaint(): Promise<void> {
    await this.#page.getByTestId(revealTestIds.hidePaintRow).click();
  }

  /** "1 / 2 ready" */
  async readyCount(): Promise<string> {
    return text(this.#page.getByTestId(revealTestIds.readyCount));
  }

  async waitForReadyCount(expected: string): Promise<void> {
    await until(
      `ready count "${expected}"`,
      () => this.readyCount(),
      (c) => c === expected,
      5_000,
    );
  }

  async ready(): Promise<void> {
    await this.#page.getByTestId(revealTestIds.readyButton).click();
  }

  /** Host: go on without waiting ("Next round", or "Show final results" after the last). */
  async moveOn(): Promise<void> {
    await this.#page.getByTestId(revealTestIds.nextButton).click();
  }

  async readyButtonIsUsable(): Promise<boolean> {
    return isUsable(this.#page.getByTestId(revealTestIds.readyButton));
  }

  async scoresAreUsable(): Promise<boolean> {
    return isUsable(this.#page.getByTestId(revealTestIds.everyoneRow));
  }
}
