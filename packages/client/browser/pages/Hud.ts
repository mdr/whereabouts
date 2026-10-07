import {
  countdownTestIds,
  hudHeaderTestIds,
  questionCardTestIds,
  soundToggleTestIds
} from "../../src/ui/bitsTestIds.ts"
import { hostControlsTestIds } from "../../src/ui/HostControlsTestIds.ts"
import { ConfirmDialog } from "./ConfirmDialog.ts"
import { ResultsPage } from "./ResultsPage.ts"
import { text } from "./support.ts"
import type { Tab } from "./Tab.ts"

/** What sits over the map on every game screen: the header strip, the question, the host's End game. */
export class Hud {
  readonly #tab: Tab

  constructor(tab: Tab) {
    this.#tab = tab
  }

  /** Waits until the round's countdown shows `seconds` or fewer. */
  async waitForCountdown(seconds: number, timeoutMs = 60_000): Promise<void> {
    await this.#tab.page.waitForFunction(
      ([id, s]) => Number(document.querySelector(`[data-testid="${id}"]`)?.textContent ?? Infinity) <= s,
      [countdownTestIds.countdown, seconds] as const,
      { timeout: timeoutMs, polling: 50 }
    )
  }

  /** "Round 2 / 3" */
  async round(): Promise<string> {
    return text(this.#tab.page.getByTestId(hudHeaderTestIds.round))
  }

  async toggleSound(): Promise<void> {
    await this.#tab.page.getByTestId(soundToggleTestIds.button).click()
  }

  async prompt(): Promise<string> {
    return text(this.#tab.page.getByTestId(questionCardTestIds.prompt))
  }

  async questionHasPhoto(): Promise<boolean> {
    return (await this.#tab.page.getByTestId(questionCardTestIds.photo).count()) > 0
  }

  /** Host only: ending the game early asks first. */
  async askToEndGame(): Promise<ConfirmDialog<ResultsPage>> {
    await this.#tab.page.getByTestId(hostControlsTestIds.endGameButton).click()
    return ConfirmDialog.whenShown(this.#tab.page, () => ResultsPage.whenShown(this.#tab))
  }
}
