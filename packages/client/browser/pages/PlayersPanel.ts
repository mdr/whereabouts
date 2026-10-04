import type { Page } from "playwright-core";
import { playersPanelTestIds } from "../../src/ui/PlayersPanelTestIds.ts";
import { playerListTestIds } from "../../src/ui/PlayerListTestIds.ts";
import { ConfirmDialog } from "./ConfirmDialog.ts";
import { PlayerList } from "./PlayerList.ts";
import { byTestIdWith } from "./support.ts";

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

  /** Host only: removing a player asks first; the round carries on without them. */
  async askToRemove(name: string): Promise<ConfirmDialog<void>> {
    await this.open();
    await byTestIdWith(this.#page.getByTestId(playersPanelTestIds.card), playerListTestIds.player, "player", name)
      .getByTestId(playerListTestIds.kickButton)
      .click();
    return ConfirmDialog.whenShown(this.#page, () => Promise.resolve());
  }
}
