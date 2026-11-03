import { expect } from "@playwright/test"
import { HintAxis } from "@whereabouts/shared/hints"
import { inGameTestIds } from "../../src/screens/InGame/InGameTestIds.ts"
import { hintTestIds } from "../../src/ui/round/Hint/HintTestIds.ts"
import { DevDrawer } from "./components/DevDrawer.ts"
import { Hud } from "./components/Hud.ts"
import { MapPanel } from "./components/MapPanel.ts"
import { PaintTools } from "./components/PaintTools.ts"
import { PlayersPanel } from "./components/PlayersPanel.ts"
import { RevealPage } from "./RevealPage.ts"
import { RoundDonePage } from "./RoundDonePage.ts"
import { Screen } from "./Screen.ts"
import { TurnedAwayPage } from "./TurnedAwayPage.ts"
import { expectHintBand, expectUsable, stillTrueFor } from "./support.ts"
import type { Tab } from "./Tab.ts"
import type { Ms } from "@whereabouts/shared/units"

/** An online round you are playing: paint, then Done (or Pass). */
export class RoundPage extends Screen {
  readonly hud: Hud
  readonly map: MapPanel
  readonly paintTools: PaintTools
  readonly playersPanel: PlayersPanel
  readonly devDrawer: DevDrawer

  static async whenShown(tab: Tab, timeout: Ms = 15_000): Promise<RoundPage> {
    const round = new RoundPage(tab)
    await expect(tab.page.getByTestId(inGameTestIds.doneButton), "the round is shown").toBeVisible({ timeout })
    await round.paintTools.waitUntilEnabled(timeout)
    await round.map.waitUntilSettled()
    return round
  }

  constructor(tab: Tab) {
    super(tab)
    this.hud = new Hud(tab)
    this.map = new MapPanel(tab.page)
    this.paintTools = new PaintTools(tab.page)
    this.playersPanel = new PlayersPanel(tab.page)
    this.devDrawer = new DevDrawer(tab.page)
  }

  /** Use a hint: a band of latitude or longitude. */
  async useHint(axis: HintAxis): Promise<void> {
    await this.page.getByTestId(axis === HintAxis.LATITUDE ? hintTestIds.latitude : hintTestIds.longitude).click()
    await expect(this.page.getByTestId(hintTestIds.band), "the hint names a band").toBeVisible()
    await this.map.waitUntilSettled()
  }

  async expectHintBand(axis: HintAxis): Promise<void> {
    await expectHintBand(this.page.getByTestId(hintTestIds.band), axis)
  }

  /** The hint card says how many hints the player has left. */
  async expectHintsLeft(count: number): Promise<void> {
    await expect(this.page.getByTestId(hintTestIds.card), `${count} hints left`).toContainText(`${count} left`)
  }

  /** The hint is on offer this round, and stays so for `duration`. */
  async expectHintStillOffered(duration: Ms = 500): Promise<void> {
    const card = this.page.getByTestId(hintTestIds.card)
    await expect(card, "a hint is on offer").toBeVisible()
    await stillTrueFor(
      "a hint staying on offer",
      duration,
      () => card.count(),
      (count) => count > 0
    )
  }

  /** No hint is on offer, and none appears within `duration`. */
  async expectNoHintOffered(duration = 500): Promise<void> {
    await expect(this.page.getByTestId(inGameTestIds.doneButton), "the round is on screen").toBeVisible()
    await stillTrueFor(
      "no hint being on offer",
      duration,
      () => this.page.getByTestId(hintTestIds.card).count(),
      (count) => count === 0
    )
  }

  /** "Done", or "Pass" while nothing is painted. */
  async expectDoneLabel(label: "Done" | "Pass"): Promise<void> {
    await expect(
      this.page.getByTestId(inGameTestIds.doneButton),
      label === "Pass" ? "with nothing painted, the button reads Pass" : "with paint down, the button reads Done"
    ).toHaveText(label)
  }

  async expectDoneUsable(): Promise<void> {
    await expectUsable(this.page.getByTestId(inGameTestIds.doneButton), "the Done button is on screen and uncovered")
  }

  /** Done (or a pass), while others are still guessing. */
  async finish(): Promise<RoundDonePage> {
    await this.page.getByTestId(inGameTestIds.doneButton).click()
    return RoundDonePage.whenShown(this.tab)
  }

  /** Done (or a pass) as the last one guessing, which ends the round. */
  async finishLast(): Promise<RevealPage> {
    await this.page.getByTestId(inGameTestIds.doneButton).click()
    return RevealPage.whenShown(this.tab)
  }

  /** The round stays under way for you for `duration`. */
  async expectStaysOpen(duration: Ms = 1_000): Promise<void> {
    const done = this.page.getByTestId(inGameTestIds.doneButton)
    await expect(done, "the round is under way").toBeVisible()
    await stillTrueFor(
      "the round staying open",
      duration,
      () => done.count(),
      (count) => count > 0
    )
  }

  /** Refresh the page mid-round: you keep your seat and your paint. */
  async reload(): Promise<RoundPage> {
    await this.page.reload({ waitUntil: "networkidle" })
    return RoundPage.whenShown(this.tab)
  }

  /** Until the connection to the game has dropped. */
  async waitForDisconnect(): Promise<void> {
    await expect
      .poll(() => this.page.evaluate(() => window.testHooks.connection?.connected()), {
        message: "the connection to the game drops"
      })
      .toBe(false)
  }

  /** Until the connection to the game is back. */
  async waitForReconnect(): Promise<void> {
    await expect
      .poll(() => this.page.evaluate(() => window.testHooks.connection?.connected()), {
        message: "the connection to the game comes back",
        timeout: 20_000
      })
      .toBe(true)
  }

  /** Until the clock runs out. */
  async waitForReveal(timeout: Ms = 20_000): Promise<RevealPage> {
    return RevealPage.whenShown(this.tab, timeout)
  }

  /** Until the host removes you from the game. */
  async waitUntilRemoved(): Promise<TurnedAwayPage> {
    return TurnedAwayPage.whenShown(this.tab)
  }
}
