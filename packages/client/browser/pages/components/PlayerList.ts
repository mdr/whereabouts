import { expect, type Locator } from "@playwright/test"
import { playerListTestIds } from "../../../src/ui/players/PlayerList/PlayerListTestIds.ts"
import { hostTagTestIds } from "../../../src/ui/players/HostTag/HostTagTestIds.ts"
import { byTestIdWith, stillTrueFor } from "../support.ts"
import type { Ms } from "@whereabouts/shared/units"

/** A list of players, wherever it appears (lobby, players panel, dev drawer). */
export class PlayerList {
  readonly #root: Locator

  constructor(root: Locator) {
    this.#root = root
  }

  #row(name: string): Locator {
    return byTestIdWith(this.#root, playerListTestIds.player, "player", name)
  }

  #rows(): Locator {
    return this.#root.getByTestId(playerListTestIds.player)
  }

  async waitForPlayer(name: string, timeout?: Ms): Promise<void> {
    await expect(this.#row(name), `${name} is in the player list`).toBeVisible({ timeout })
  }

  async waitForPlayerGone(name: string, timeout?: Ms): Promise<void> {
    await expect(this.#row(name), `${name} is gone from the player list`).toBeHidden({ timeout })
  }

  async expectNames(names: string[]): Promise<void> {
    await expect(
      this.#rows().getByTestId(playerListTestIds.name),
      `the player list is ${JSON.stringify(names)}`
    ).toHaveText(names)
  }

  async expectCount(count: number): Promise<void> {
    await expect(this.#rows(), `the player list has ${count} players`).toHaveCount(count)
  }

  async expectHost(name: string): Promise<void> {
    await expect(this.#row(name).getByTestId(hostTagTestIds.hostTag), `${name} is the host`).toBeVisible()
  }

  /** Whom the viewer can remove: the host can remove everyone but herself. */
  async expectRemovable(names: string[]): Promise<void> {
    await expect(
      this.#rows()
        .filter({ has: this.#root.page().getByTestId(playerListTestIds.kickButton) })
        .getByTestId(playerListTestIds.name),
      `the viewer can remove only ${JSON.stringify(names)}`
    ).toHaveText(names)
  }

  /** The list keeps `count` players for `duration`, once it has that many. */
  async expectCountStays(count: number, duration: Ms = 500): Promise<void> {
    await this.expectCount(count)
    await stillTrueFor(
      `the player list keeping ${count} players`,
      duration,
      () => this.#rows().count(),
      (now) => now === count
    )
  }
}
