import { joinedTestIds } from "../../src/screens/MultiplayerTestIds.ts";
import { HomePage } from "./HomePage.ts";
import { Screen } from "./Screen.ts";
import { text } from "./support.ts";
import type { Tab } from "./Tab.ts";

/** What a player sees when they can't be in the game, e.g. after the host removes them. */
export class TurnedAwayPage extends Screen {
  static async whenShown(tab: Tab): Promise<TurnedAwayPage> {
    await tab.page.getByTestId(joinedTestIds.problem).waitFor({ timeout: 10_000 });
    return new TurnedAwayPage(tab);
  }

  async reason(): Promise<string> {
    return text(this.page.getByTestId(joinedTestIds.problemTitle));
  }

  async backToStart(): Promise<HomePage> {
    await this.page.getByTestId(joinedTestIds.backToStartButton).click();
    return HomePage.whenShown(this.tab);
  }
}
