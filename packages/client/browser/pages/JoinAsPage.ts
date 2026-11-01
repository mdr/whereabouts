import { expect } from "@playwright/test"
import { joinAsTestIds } from "../../src/screens/multiplayer/JoinAs/JoinAsTestIds.ts"
import { LobbyPage } from "./LobbyPage.ts"
import { Screen } from "./Screen.ts"
import type { Tab } from "./Tab.ts"
import { TurnedAwayPage } from "./TurnedAwayPage.ts"

/** The page a game link opens: confirm your name, then join. */
export class JoinAsPage extends Screen {
  static async whenShown(tab: Tab): Promise<JoinAsPage> {
    await expect(tab.page.getByTestId(joinAsTestIds.page), "the join page is shown").toBeVisible()
    return new JoinAsPage(tab)
  }

  async enterName(name: string): Promise<void> {
    await this.page.getByTestId(joinAsTestIds.nameInput).fill(name)
  }

  async join(): Promise<LobbyPage> {
    await this.page.getByTestId(joinAsTestIds.joinButton).click()
    return LobbyPage.whenShown(this.tab)
  }

  /** Join by a link to a game that no longer exists. */
  async joinMissingGame(): Promise<TurnedAwayPage> {
    await this.page.getByTestId(joinAsTestIds.joinButton).click()
    return TurnedAwayPage.whenShown(this.tab)
  }
}
