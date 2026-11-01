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
import { isUsable, text, until } from "./support.ts"
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
    await tab.page.getByTestId(inGameTestIds.doneButton).waitFor({ timeout })
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

  /** Use a hint: a band of latitude or longitude. Returns what the band says. */
  async useHint(axis: HintAxis): Promise<string> {
    await this.page.getByTestId(axis === HintAxis.LATITUDE ? hintTestIds.latitude : hintTestIds.longitude).click()
    const band = await text(this.page.getByTestId(hintTestIds.band))
    await this.map.waitUntilSettled()
    return band
  }

  /** Whether a hint is on offer this round. */
  async canUseHint(): Promise<boolean> {
    return (await this.page.getByTestId(hintTestIds.card).count()) > 0
  }

  /** "Done", or "Pass" while nothing is painted. */
  async doneButtonLabel(): Promise<string> {
    return text(this.page.getByTestId(inGameTestIds.doneButton))
  }

  async doneButtonIsUsable(): Promise<boolean> {
    return isUsable(this.page.getByTestId(inGameTestIds.doneButton))
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

  /** Whether the round is still under way for you. */
  async isStillShown(): Promise<boolean> {
    return (await this.page.getByTestId(inGameTestIds.doneButton).count()) > 0
  }

  /** Refresh the page mid-round: you keep your seat and your paint. */
  async reload(): Promise<RoundPage> {
    await this.page.reload({ waitUntil: "networkidle" })
    return RoundPage.whenShown(this.tab)
  }

  /** Until the connection to the game has dropped. */
  async waitForDisconnect(): Promise<void> {
    await until(
      "the connection to drop",
      () => this.page.evaluate(() => window.testHooks.connection?.connected()),
      (connected) => connected === false
    )
  }

  /** Until the connection to the game is back. */
  async waitForReconnect(): Promise<void> {
    await until(
      "the connection to come back",
      () => this.page.evaluate(() => window.testHooks.connection?.connected()),
      (connected) => connected === true,
      20_000
    )
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
