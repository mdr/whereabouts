import type { Locator } from "@playwright/test"
import { playerListTestIds } from "../../../src/ui/players/PlayerListTestIds.ts"
import { hostTagTestIds } from "../../../src/ui/players/HostTagTestIds.ts"
import { until } from "../support.ts"
import type { Ms } from "@whereabouts/shared/units"

export interface ListedPlayer {
  name: string
  isHost: boolean
  /** Whether you can remove them (you are the host and it is not you). */
  removable: boolean
}

/** A list of players, wherever it appears (lobby, players panel, dev drawer). */
export class PlayerList {
  readonly #root: Locator

  constructor(root: Locator) {
    this.#root = root
  }

  async players(): Promise<ListedPlayer[]> {
    const rows = await this.#root.getByTestId(playerListTestIds.player).all()
    return Promise.all(
      rows.map(async (row) => ({
        name: (await row.getByTestId(playerListTestIds.name).textContent())?.trim() ?? "",
        isHost: (await row.getByTestId(hostTagTestIds.hostTag).count()) > 0,
        removable: (await row.getByTestId(playerListTestIds.kickButton).count()) > 0
      }))
    )
  }

  async names(): Promise<string[]> {
    return (await this.players()).map((p) => p.name)
  }

  async waitForPlayer(name: string, timeout?: Ms): Promise<void> {
    await until(
      `${name} in the player list`,
      () => this.names(),
      (names) => names.includes(name),
      timeout
    )
  }
}
