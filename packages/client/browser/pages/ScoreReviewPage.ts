import { expect, type Locator } from "@playwright/test"
import { scoreReviewTestIds } from "../../src/screens/score-review/ScoreReview/ScoreReviewTestIds.ts"
import { verdictCardTestIds } from "../../src/screens/score-review/VerdictCard/VerdictCardTestIds.ts"
import { MapPanel } from "./components/MapPanel.ts"
import { Screen } from "./Screen.ts"
import { text } from "./support.ts"
import type { Tab } from "./Tab.ts"

/** A made-up guess, its score, and the verdict to give on it. */
export class ScoreReviewPage extends Screen {
  readonly map: MapPanel

  static async whenShown(tab: Tab): Promise<ScoreReviewPage> {
    const review = new ScoreReviewPage(tab)
    await expect(tab.page.getByTestId(verdictCardTestIds.progress), "the score review is shown").toBeVisible()
    await review.map.waitUntilSettled()
    return review
  }

  constructor(tab: Tab) {
    super(tab)
    this.map = new MapPanel(tab.page)
  }

  /** A single guess's score. */
  async score(): Promise<string> {
    return text(this.page.getByTestId(scoreReviewTestIds.score))
  }

  /** Whether this case is two guesses to compare. */
  async isPair(): Promise<boolean> {
    return (await this.page.getByTestId(verdictCardTestIds.pair).count()) > 0
  }

  async expectScoreIsInteger(): Promise<void> {
    await expect(this.page.getByTestId(scoreReviewTestIds.score), "a single guess shows its score").toHaveText(/^\d+$/)
  }

  /** A pair's two scores, A then B. */
  async expectPairScores(): Promise<void> {
    await expect(
      this.page.getByTestId(verdictCardTestIds.pairScore),
      "a pair shows both scores, as whole numbers"
    ).toHaveText([/^\d+$/, /^\d+$/])
  }

  /** Rest the mouse on guess A (0) or B (1) of a pair. */
  async hoverGuess(i: 0 | 1): Promise<void> {
    await this.page.getByTestId(verdictCardTestIds.pairGuess).nth(i).hover()
    await this.map.waitUntilSettled()
  }

  /** Move the mouse off the cards, onto the map. */
  async stopHovering(): Promise<void> {
    await this.map.hover({ across: 0.5, down: 0.5 })
    await this.map.waitUntilSettled()
  }

  /** Skip to the next case without judging this one. */
  async skip(): Promise<void> {
    await this.page.getByTestId(scoreReviewTestIds.skipButton).click()
    await this.map.waitUntilSettled()
  }

  /** "3 of 32 judged in this set." */
  async expectJudged(count: number): Promise<void> {
    await expect(this.page.getByTestId(verdictCardTestIds.progress), `${count} of the set of 32 are judged`).toHaveText(
      new RegExp(`^${count} of 32`)
    )
  }

  /** Give a verdict with its number key (1 much too low … 5 much too high) and submit with Enter. */
  async judgeWithKeys(key: number): Promise<void> {
    await this.page.keyboard.press(String(key))
    await this.page.keyboard.press("Enter")
    await this.map.waitUntilSettled()
  }

  /** The verdict choices are one Tab stop. */
  async expectVerdictsOneTabStop(): Promise<void> {
    await expect(
      this.page.getByTestId(verdictCardTestIds.verdict).and(this.page.locator('[tabindex="0"]')),
      "the verdict choices are one Tab stop"
    ).toHaveCount(1)
  }

  /** Click a verdict, then press a key on it. */
  async clickVerdictThenPress(verdict: number, key: string): Promise<void> {
    await this.#verdict(verdict).click()
    await this.page.keyboard.press(key)
  }

  /** This verdict is the one chosen and has focus. */
  async expectVerdictChosenAndFocused(verdict: number): Promise<void> {
    await expect(this.#verdict(verdict), `verdict ${verdict} is chosen`).toBeChecked()
    await expect(this.#verdict(verdict), `verdict ${verdict} has focus`).toBeFocused()
  }

  #verdict(verdict: number): Locator {
    return this.page.locator(`[data-testid="${verdictCardTestIds.verdict}"][data-verdict="${verdict}"]`)
  }

  /** Give a verdict by clicking, with what it should have scored and why. */
  async judge(verdict: number, shouldBe: number, note: string): Promise<void> {
    await this.page.locator(`[data-testid="${verdictCardTestIds.verdict}"][data-verdict="${verdict}"]`).click()
    await this.page.getByTestId(verdictCardTestIds.shouldBeInput).fill(String(shouldBe))
    await this.page.getByTestId(verdictCardTestIds.noteInput).fill(note)
    await this.page.getByTestId(scoreReviewTestIds.submitButton).click()
    await this.map.waitUntilSettled()
  }

  /** The exported verdicts file's text. */
  async export(): Promise<string> {
    const [download] = await Promise.all([
      this.page.waitForEvent("download"),
      this.page.getByTestId(verdictCardTestIds.exportButton).click()
    ])
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString("utf8")
  }
}
