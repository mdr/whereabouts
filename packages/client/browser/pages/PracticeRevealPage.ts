import { soloTestIds } from "../../src/screens/SoloTestIds.ts"
import { MapPanel } from "./MapPanel.ts"
import { Screen } from "./Screen.ts"
import { text } from "./support.ts"
import type { Tab } from "./Tab.ts"

/** A practice question's answer and score. */
export class PracticeRevealPage extends Screen {
  readonly map: MapPanel

  static async whenShown(tab: Tab): Promise<PracticeRevealPage> {
    const reveal = new PracticeRevealPage(tab)
    await tab.page.getByTestId(soloTestIds.roundScore).waitFor()
    await reveal.map.waitUntilSettled()
    return reveal
  }

  constructor(tab: Tab) {
    super(tab)
    this.map = new MapPanel(tab.page)
  }

  async score(): Promise<string> {
    return text(this.page.getByTestId(soloTestIds.roundScore))
  }
}
