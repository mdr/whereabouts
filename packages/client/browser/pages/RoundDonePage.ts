import { inGameTestIds } from "../../src/screens/InGameTestIds.ts"
import { Hud } from "./Hud.ts"
import { PlayersPanel } from "./PlayersPanel.ts"
import { RevealPage } from "./RevealPage.ts"
import { RoundPage } from "./RoundPage.ts"
import { Screen } from "./Screen.ts"
import type { Tab } from "./Tab.ts"

/** You pressed Done and wait for the others, or for the clock. */
export class RoundDonePage extends Screen {
  readonly hud: Hud
  readonly playersPanel: PlayersPanel

  static async whenShown(tab: Tab): Promise<RoundDonePage> {
    await tab.page.getByTestId(inGameTestIds.doneNote).waitFor({ timeout: 5_000 })
    return new RoundDonePage(tab)
  }

  constructor(tab: Tab) {
    super(tab)
    this.hud = new Hud(tab)
    this.playersPanel = new PlayersPanel(tab.page)
  }

  /** Take back Done, to change your guess. */
  async keepEditing(): Promise<RoundPage> {
    await this.page.getByTestId(inGameTestIds.keepEditingButton).click()
    return RoundPage.whenShown(this.tab, 5_000)
  }

  async waitForReveal(timeoutMs = 20_000): Promise<RevealPage> {
    return RevealPage.whenShown(this.tab, timeoutMs)
  }
}
