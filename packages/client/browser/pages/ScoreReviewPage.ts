import { scoreReviewTestIds } from "../../src/screens/ScoreReviewTestIds.ts"
import { MapPanel } from "./MapPanel.ts"
import { Screen } from "./Screen.ts"
import { text } from "./support.ts"
import type { Tab } from "./Tab.ts"

/** A made-up guess, its score, and the verdict to give on it. */
export class ScoreReviewPage extends Screen {
  readonly map: MapPanel

  static async whenShown(tab: Tab): Promise<ScoreReviewPage> {
    const review = new ScoreReviewPage(tab)
    await tab.page.getByTestId(scoreReviewTestIds.progress).waitFor()
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
    return (await this.page.getByTestId(scoreReviewTestIds.pair).count()) > 0
  }

  /** A pair's two scores, A then B. */
  async pairScores(): Promise<string[]> {
    return this.page.getByTestId(scoreReviewTestIds.pairScore).allTextContents()
  }

  /** Rest the mouse on guess A (0) or B (1) of a pair. */
  async hoverGuess(i: 0 | 1): Promise<void> {
    await this.page.getByTestId(scoreReviewTestIds.pair).locator("li").nth(i).hover()
    await this.map.waitUntilSettled()
  }

  /** Move the mouse off the cards, onto the map. */
  async stopHovering(): Promise<void> {
    await this.map.hover({ across: 0.5, down: 0.5 })
    await this.map.waitUntilSettled()
  }

  /** Skip to the next case without judging this one. */
  async skip(): Promise<void> {
    await this.page.getByRole("button", { name: "Skip" }).click()
    await this.map.waitUntilSettled()
  }

  /** "3 of 32 judged in this set." */
  async progress(): Promise<string> {
    return text(this.page.getByTestId(scoreReviewTestIds.progress))
  }

  /** Give a verdict with its number key (1 much too low … 5 much too high) and submit with Enter. */
  async judgeWithKeys(key: number): Promise<void> {
    await this.page.keyboard.press(String(key))
    await this.page.keyboard.press("Enter")
    await this.map.waitUntilSettled()
  }

  /** Give a verdict by clicking, with what it should have scored and why. */
  async judge(verdict: number, shouldBe: number, note: string): Promise<void> {
    await this.page.locator(`[data-testid="${scoreReviewTestIds.verdict}"][data-verdict="${verdict}"]`).click()
    await this.page.getByRole("spinbutton", { name: "It should be about" }).fill(String(shouldBe))
    await this.page.getByPlaceholder("Why? (optional)").fill(note)
    await this.page.getByTestId(scoreReviewTestIds.submitButton).click()
    await this.map.waitUntilSettled()
  }

  /** The exported verdicts file's text. */
  async export(): Promise<string> {
    const [download] = await Promise.all([
      this.page.waitForEvent("download"),
      this.page.getByTestId(scoreReviewTestIds.exportButton).click()
    ])
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString("utf8")
  }
}
