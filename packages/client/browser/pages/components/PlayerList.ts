import { PageObject } from "../steps.ts"
import { expect, type Locator } from "@playwright/test"
import { playerListTestIds } from "../../../src/ui/players/PlayerList/PlayerListTestIds.ts"
import { hostTagTestIds } from "../../../src/ui/players/HostTag/HostTagTestIds.ts"
import { PlayerTag } from "../../../src/ui/players/player-tags.ts"
import { ConfirmDialog } from "./ConfirmDialog.ts"
import { byTestIdWith, stillTrueFor } from "../support.ts"
import type { Ms } from "@whereabouts/shared/units"

/** A list of players, wherever it appears (lobby, players panel, dev drawer). */
export class PlayerList extends PageObject {
  readonly #root: Locator

  constructor(root: Locator) {
    super()
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

  /** Whom the viewer can hand hosting to: others who are online and not hosting. */
  async expectMakeable(names: string[]): Promise<void> {
    await expect(
      this.#rows()
        .filter({ has: this.#root.page().getByTestId(playerListTestIds.makeHostButton) })
        .getByTestId(playerListTestIds.name),
      `the viewer can make only ${JSON.stringify(names)} host`
    ).toHaveText(names)
  }

  /** Host only: handing over asks first. */
  async askToMakeHost(name: string): Promise<ConfirmDialog<void>> {
    await this.#row(name).getByTestId(playerListTestIds.makeHostButton).click()
    return ConfirmDialog.whenShown(this.#root.page(), () => Promise.resolve())
  }

  #tag(name: string, tag: PlayerTag): Locator {
    return this.#row(name).locator(`[data-testid="${playerListTestIds.tag}"][data-tag="${tag}"]`)
  }

  async expectOffline(name: string, offline = true): Promise<void> {
    await expect(this.#tag(name, PlayerTag.OFFLINE), `${name} is ${offline ? "" : "not "}tagged offline`).toHaveCount(
      offline ? 1 : 0
    )
  }

  /** Finished guessing this round. */
  async expectDone(name: string, done = true): Promise<void> {
    await expect(this.#tag(name, PlayerTag.DONE), `${name} is ${done ? "" : "not "}tagged done`).toHaveCount(
      done ? 1 : 0
    )
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
