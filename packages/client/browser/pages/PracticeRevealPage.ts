import { expect } from "@playwright/test"
import { soloTestIds } from "../../src/screens/solo/Solo/SoloTestIds.ts"
import { questionImageTestIds } from "../../src/ui/round/question/QuestionImage/QuestionImageTestIds.ts"
import { factLineTestIds } from "../../src/ui/round/question/FactLine/FactLineTestIds.ts"
import { MapPanel } from "./components/MapPanel.ts"
import { Screen } from "./Screen.ts"
import { expectNumber, type Bounds } from "./support.ts"
import type { Tab } from "./Tab.ts"

/** A practice question's answer and score. */
export class PracticeRevealPage extends Screen {
  readonly map: MapPanel

  static async whenShown(tab: Tab): Promise<PracticeRevealPage> {
    const reveal = new PracticeRevealPage(tab)
    await expect(tab.page.getByTestId(soloTestIds.roundScore), "the practice reveal is shown").toBeVisible()
    await reveal.map.waitUntilSettled()
    return reveal
  }

  /** The reveal while VR shows it: the page's map, which whenShown waits on, draws nothing then. */
  static async whenShownInHeadset(tab: Tab): Promise<PracticeRevealPage> {
    const reveal = new PracticeRevealPage(tab)
    await expect(tab.page.getByTestId(soloTestIds.roundScore), "the practice reveal is shown").toBeVisible()
    return reveal
  }

  constructor(tab: Tab) {
    super(tab)
    this.map = new MapPanel(tab.page)
  }

  async score(): Promise<number> {
    return Number(await this.page.getByTestId(soloTestIds.roundScore).innerText())
  }

  async expectScore(bounds: Bounds): Promise<void> {
    await expectNumber("the round's score", () => this.score(), bounds)
  }

  /** Next round, clicked on the page: a headset has no pointer to press it. */
  async next(): Promise<void> {
    await this.page.getByTestId(soloTestIds.nextButton).dispatchEvent("click")
  }

  async expectScoreIsInteger(): Promise<void> {
    await expect(this.page.getByTestId(soloTestIds.roundScore), "the reveal shows a whole-number score").toHaveText(
      /^-?\d+$/
    )
  }

  /** The line of interest about the answer, once the facts have loaded. */
  async expectFactLine(): Promise<void> {
    await expect(this.page.getByTestId(factLineTestIds.fact), "there is a line about the answer").toHaveText(/.{21}/)
  }

  async expectPhoto(): Promise<void> {
    await expect(this.page.getByTestId(questionImageTestIds.photo).first(), "the reveal has a photo").toBeAttached()
  }
}
