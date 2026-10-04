import { resultsTestIds } from "../../src/screens/ResultsTestIds.ts";
import { LobbyPage } from "./LobbyPage.ts";
import { Screen } from "./Screen.ts";
import type { Tab } from "./Tab.ts";

/** The final standings. */
export class ResultsPage extends Screen {
  static async whenShown(tab: Tab, timeoutMs = 10_000): Promise<ResultsPage> {
    await tab.page.getByTestId(resultsTestIds.page).waitFor({ timeout: timeoutMs });
    return new ResultsPage(tab);
  }

  /** Player names, winner first. */
  async standings(): Promise<string[]> {
    const rows = await this.page.getByTestId(resultsTestIds.standingsRow).all();
    return Promise.all(rows.map(async (row) => (await row.getAttribute("data-player")) ?? ""));
  }

  /** Host: everyone back to the same lobby. */
  async playAgain(): Promise<LobbyPage> {
    await this.page.getByTestId(resultsTestIds.playAgainButton).click();
    return LobbyPage.whenShown(this.tab, 10_000);
  }

  async waitForLobby(): Promise<LobbyPage> {
    return LobbyPage.whenShown(this.tab, 10_000);
  }
}
