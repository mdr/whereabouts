import { expect } from "@playwright/test"
import { hudTestIds } from "../../../src/ui/map/Hud/HudTestIds.ts"
import { countdownTestIds } from "../../../src/ui/map/Countdown/CountdownTestIds.ts"
import { soundToggleTestIds } from "../../../src/ui/map/SoundToggle/SoundToggleTestIds.ts"
import { questionCardTestIds } from "../../../src/ui/round/question/QuestionCard/QuestionCardTestIds.ts"
import { questionImageTestIds } from "../../../src/ui/round/question/QuestionImage/QuestionImageTestIds.ts"
import { hostControlsTestIds } from "../../../src/ui/players/HostControls/HostControlsTestIds.ts"
import { ConfirmDialog } from "./ConfirmDialog.ts"
import { ResultsPage } from "../ResultsPage.ts"
import { expectNumber, expectUsable, softExpect, text, type Bounds } from "../support.ts"
import type { Tab } from "../Tab.ts"
import type { Ms, Px, Seconds } from "@whereabouts/shared/units"

/** What sits over the map on every game screen: the header strip, the question, the host's End game. */
export class Hud {
  readonly #tab: Tab

  constructor(tab: Tab) {
    this.#tab = tab
  }

  /** Waits until the round's countdown shows `seconds` or fewer. */
  async waitForCountdown(seconds: Seconds, timeout: Ms = 60_000): Promise<void> {
    await this.#tab.page.waitForFunction(
      ([id, s]) => Number(document.querySelector(`[data-testid="${id}"]`)?.textContent ?? Infinity) <= s,
      [countdownTestIds.countdown, seconds] as const,
      { timeout: timeout, polling: 50 }
    )
  }

  /** "Round 2 / 3" */
  async expectRound(round: string): Promise<void> {
    await expect(this.#tab.page.getByTestId(hudTestIds.round), `the HUD says ${round}`).toHaveText(round)
  }

  async toggleSound(): Promise<void> {
    await this.#tab.page.getByTestId(soundToggleTestIds.button).click()
  }

  async prompt(): Promise<string> {
    return text(this.#tab.page.getByTestId(questionCardTestIds.prompt))
  }

  async expectQuestionPhoto(): Promise<void> {
    await expect(
      this.#tab.page.getByTestId(questionImageTestIds.photo).first(),
      "the question has a photo"
    ).toBeAttached()
  }

  /** Phones only: fold the question card down to its prompt, or open it out again. */
  async toggleQuestionFold(): Promise<void> {
    await this.#tab.page.getByTestId(questionCardTestIds.foldButton).click()
  }

  async expectQuestionFoldUsable(): Promise<void> {
    await expectUsable(
      this.#tab.page.getByTestId(questionCardTestIds.foldButton),
      "the question's fold button is on screen and uncovered"
    )
  }

  /** The question card's height on screen, in CSS pixels. */
  async questionHeight(): Promise<Px> {
    return (await this.#tab.page.getByTestId(questionCardTestIds.card).boundingBox())?.height ?? 0
  }

  /** Phones: a layout check, so a failure does not stop the run. */
  async expectQuestionHeight(message: string, bounds: Bounds): Promise<void> {
    await expectNumber(message, () => this.questionHeight(), bounds, { expector: softExpect })
  }

  /** Host only: ending the game early asks first. */
  async askToEndGame(): Promise<ConfirmDialog<ResultsPage>> {
    await this.#tab.page.getByTestId(hostControlsTestIds.endGameButton).click()
    return ConfirmDialog.whenShown(this.#tab.page, () => ResultsPage.whenShown(this.#tab))
  }
}
