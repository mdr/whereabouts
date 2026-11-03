import { expect } from "@playwright/test"
import { HintAxis } from "@whereabouts/shared/hints"
import { soloTestIds } from "../../src/screens/solo/Solo/SoloTestIds.ts"
import { hintTestIds } from "../../src/ui/round/Hint/HintTestIds.ts"
import { DevDrawer } from "./components/DevDrawer.ts"
import { Hud } from "./components/Hud.ts"
import { MapPanel } from "./components/MapPanel.ts"
import { PaintTools } from "./components/PaintTools.ts"
import { Shortcuts } from "./components/Shortcuts.ts"
import { PracticeRevealPage } from "./PracticeRevealPage.ts"
import { Screen } from "./Screen.ts"
import { expectHintBand, stillTrueFor } from "./support.ts"
import type { Tab } from "./Tab.ts"
import type { Ms } from "@whereabouts/shared/units"

/** A practice question: paint, then Submit. */
export class PracticeRoundPage extends Screen {
  readonly hud: Hud
  readonly map: MapPanel
  readonly paintTools: PaintTools
  readonly devDrawer: DevDrawer
  readonly shortcuts: Shortcuts

  static async whenShown(tab: Tab): Promise<PracticeRoundPage> {
    const round = new PracticeRoundPage(tab)
    await expect(tab.page.getByTestId(soloTestIds.submitButton), "the practice round is shown").toBeVisible({
      timeout: 30_000
    })
    await round.map.waitUntilSettled()
    return round
  }

  constructor(tab: Tab) {
    super(tab)
    this.hud = new Hud(tab)
    this.map = new MapPanel(tab.page)
    this.paintTools = new PaintTools(tab.page)
    this.devDrawer = new DevDrawer(tab.page)
    this.shortcuts = new Shortcuts(tab.page)
  }

  /** Use a hint: a band of latitude or longitude. */
  async useHint(axis: HintAxis): Promise<void> {
    await this.page.getByTestId(axis === HintAxis.LATITUDE ? hintTestIds.latitude : hintTestIds.longitude).click()
    await expect(this.page.getByTestId(hintTestIds.band), "the hint names a band").toBeVisible()
    await this.map.waitUntilSettled()
  }

  async expectHintBand(axis: HintAxis): Promise<void> {
    await expectHintBand(this.page.getByTestId(hintTestIds.band), axis)
  }

  /** Hints are on offer with no count, as they are unlimited in practice. */
  async expectUnlimitedHints(): Promise<void> {
    const card = this.page.getByTestId(hintTestIds.card)
    await expect(card, "a hint is on offer").toBeVisible()
    await expect(card, "practice hints are not counted").not.toContainText("left")
  }

  /** The round is not submitted: Submit is still there, and no score appears within `duration`. */
  async expectNotSubmitted(duration: Ms = 1_000): Promise<void> {
    await expect(this.page.getByTestId(soloTestIds.submitButton), "the round is still under way").toBeVisible()
    await stillTrueFor(
      "no score appearing",
      duration,
      () => this.page.getByTestId(soloTestIds.roundScore).count(),
      (count) => count === 0
    )
  }

  async submit(): Promise<PracticeRevealPage> {
    await this.page.getByTestId(soloTestIds.submitButton).click()
    return PracticeRevealPage.whenShown(this.tab)
  }

  async submitWithKeyboard(): Promise<PracticeRevealPage> {
    await this.page.keyboard.press("Enter")
    return PracticeRevealPage.whenShown(this.tab)
  }
}
