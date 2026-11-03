import { expect } from "@playwright/test"
import { takeSeatTestIds } from "../../src/ui/players/TakeSeat/TakeSeatTestIds.ts"
import { Screen } from "./Screen.ts"
import { SittingOutPage } from "./SittingOutPage.ts"
import type { Tab } from "./Tab.ts"

/** A spectator watching a round: they can ask to play from the next question. */
export class WatchingPage extends Screen {
  static async whenShown(tab: Tab): Promise<WatchingPage> {
    await expect(
      tab.page.getByTestId(takeSeatTestIds.button),
      "a spectator is offered a seat during the round"
    ).toBeVisible({ timeout: 15_000 })
    return new WatchingPage(tab)
  }

  /** Take a seat: sit out the round under way. */
  async playFromNextQuestion(): Promise<SittingOutPage> {
    await this.page.getByTestId(takeSeatTestIds.button).click()
    return SittingOutPage.whenShown(this.tab)
  }
}
