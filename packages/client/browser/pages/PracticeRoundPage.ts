import { HintAxis } from "@whereabouts/shared/hints"
import { soloTestIds } from "../../src/screens/solo/SoloTestIds.ts"
import { hintTestIds } from "../../src/ui/round/HintTestIds.ts"
import { DevDrawer } from "./components/DevDrawer.ts"
import { Hud } from "./components/Hud.ts"
import { MapPanel } from "./components/MapPanel.ts"
import { PaintTools } from "./components/PaintTools.ts"
import { PracticeRevealPage } from "./PracticeRevealPage.ts"
import { Screen } from "./Screen.ts"
import type { Tab } from "./Tab.ts"

/** A practice question: paint, then Submit. */
export class PracticeRoundPage extends Screen {
  readonly hud: Hud
  readonly map: MapPanel
  readonly paintTools: PaintTools
  readonly devDrawer: DevDrawer

  static async whenShown(tab: Tab): Promise<PracticeRoundPage> {
    const round = new PracticeRoundPage(tab)
    await tab.page.getByTestId(soloTestIds.submitButton).waitFor({ timeout: 30_000 })
    await round.map.waitUntilSettled()
    return round
  }

  constructor(tab: Tab) {
    super(tab)
    this.hud = new Hud(tab)
    this.map = new MapPanel(tab.page)
    this.paintTools = new PaintTools(tab.page)
    this.devDrawer = new DevDrawer(tab.page)
  }

  /** Use a hint: a band of latitude or longitude. Returns what the band says. */
  async useHint(axis: HintAxis): Promise<string> {
    await this.page.getByTestId(axis === HintAxis.LATITUDE ? hintTestIds.latitude : hintTestIds.longitude).click()
    const band = await this.page.getByTestId(hintTestIds.band).innerText()
    await this.map.waitUntilSettled()
    return band.trim()
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
