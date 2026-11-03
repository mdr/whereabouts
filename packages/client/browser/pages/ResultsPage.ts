import { expect } from "@playwright/test"
import { resultsTestIds } from "../../src/screens/results/Results/ResultsTestIds.ts"
import { standingsTestIds } from "../../src/screens/results/Standings/StandingsTestIds.ts"
import { smallFlagButtonTestIds } from "../../src/ui/pictures/SmallFlagButton/SmallFlagButtonTestIds.ts"
import { FlagPicture } from "./components/FlagPicture.ts"
import { LobbyPage } from "./LobbyPage.ts"
import { Screen } from "./Screen.ts"
import type { Tab } from "./Tab.ts"
import type { Ms } from "@whereabouts/shared/units"

/** The final standings. */
export class ResultsPage extends Screen {
  /** The flag beside a flag round in the list of rounds. */
  get roundFlag(): FlagPicture {
    return new FlagPicture(this.page, this.page.getByTestId(smallFlagButtonTestIds.flag))
  }

  static async whenShown(tab: Tab, timeout: Ms = 10_000): Promise<ResultsPage> {
    await expect(tab.page.getByTestId(resultsTestIds.page), "the final standings are shown").toBeVisible({ timeout })
    return new ResultsPage(tab)
  }

  async expectStandingsCount(count: number): Promise<void> {
    await expect(
      this.page.getByTestId(standingsTestIds.standingsRow),
      `the final standings list ${count} players`
    ).toHaveCount(count)
  }

  /** Host: everyone back to the same lobby. */
  async playAgain(): Promise<LobbyPage> {
    await this.page.getByTestId(resultsTestIds.playAgainButton).click()
    return LobbyPage.whenShown(this.tab, 10_000)
  }

  async waitForLobby(): Promise<LobbyPage> {
    return LobbyPage.whenShown(this.tab, 10_000)
  }
}
