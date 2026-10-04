import { homeTestIds } from "../../src/screens/HomeTestIds.ts";
import { LobbyPage } from "./LobbyPage.ts";
import { Screen } from "./Screen.ts";
import { SittingOutPage } from "./SittingOutPage.ts";
import type { Tab } from "./Tab.ts";

/** The front page: your name, then host, join or practise. */
export class HomePage extends Screen {
  static async whenShown(tab: Tab): Promise<HomePage> {
    await tab.page.getByTestId(homeTestIds.page).waitFor();
    return new HomePage(tab);
  }

  async enterName(name: string): Promise<void> {
    await this.page.getByTestId(homeTestIds.nameInput).fill(name);
  }

  async hostGame(): Promise<LobbyPage> {
    await this.page.getByTestId(homeTestIds.hostButton).click();
    return LobbyPage.whenShown(this.tab);
  }

  async joinGame(code: string): Promise<LobbyPage> {
    await this.#join(code);
    return LobbyPage.whenShown(this.tab);
  }

  /** Join a game whose round has already started: you sit it out. */
  async joinGameMidRound(code: string): Promise<SittingOutPage> {
    await this.#join(code);
    return SittingOutPage.whenShown(this.tab);
  }

  async #join(code: string): Promise<void> {
    await this.page.getByTestId(homeTestIds.codeInput).fill(code);
    await this.page.getByTestId(homeTestIds.joinButton).click();
  }
}
