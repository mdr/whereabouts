import { inGameTestIds } from "../../src/screens/InGameTestIds.ts";
import { RevealPage } from "./RevealPage.ts";
import { Screen } from "./Screen.ts";
import type { Tab } from "./Tab.ts";

/** A late joiner watching the round under way; they play from the next one. */
export class SittingOutPage extends Screen {
  static async whenShown(tab: Tab): Promise<SittingOutPage> {
    await tab.page.getByTestId(inGameTestIds.sittingOutNote).waitFor({ timeout: 10_000 });
    return new SittingOutPage(tab);
  }

  async waitForReveal(timeoutMs = 20_000): Promise<RevealPage> {
    return RevealPage.whenShown(this.tab, timeoutMs);
  }
}
