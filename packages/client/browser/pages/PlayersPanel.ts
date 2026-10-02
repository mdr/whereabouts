import type { Page } from "playwright-core";
import { playersPanelTestIds } from "../../src/ui/PlayersPanelTestIds.ts";
import { PlayerList } from "./PlayerList.ts";

/** The collapsible list of players over the map during a round. */
export class PlayersPanel {
  readonly #page: Page;
  readonly players: PlayerList;

  constructor(page: Page) {
    this.#page = page;
    this.players = new PlayerList(page.getByTestId(playersPanelTestIds.card));
  }

  async open(): Promise<void> {
    if ((await this.#page.getByTestId(playersPanelTestIds.card).count()) > 0) return;
    await this.#page.getByTestId(playersPanelTestIds.toggle).click();
    await this.#page.getByTestId(playersPanelTestIds.card).waitFor();
  }

  async close(): Promise<void> {
    if ((await this.#page.getByTestId(playersPanelTestIds.card).count()) === 0) return;
    await this.#page.getByTestId(playersPanelTestIds.toggle).click();
    await this.#page.getByTestId(playersPanelTestIds.card).waitFor({ state: "detached" });
  }
}
