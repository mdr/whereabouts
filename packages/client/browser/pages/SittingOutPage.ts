import { inGameTestIds } from "../../src/screens/InGame/InGameTestIds.ts"
import { RevealPage } from "./RevealPage.ts"
import { Screen } from "./Screen.ts"
import type { Tab } from "./Tab.ts"
import type { Ms } from "@whereabouts/shared/units"

/** A late joiner watching the round under way; they play from the next one. */
export class SittingOutPage extends Screen {
  static async whenShown(tab: Tab): Promise<SittingOutPage> {
    await tab.page.getByTestId(inGameTestIds.sittingOutNote).waitFor({ timeout: 10_000 })
    return new SittingOutPage(tab)
  }

  async waitForReveal(timeout: Ms = 20_000): Promise<RevealPage> {
    return RevealPage.whenShown(this.tab, timeout)
  }
}
