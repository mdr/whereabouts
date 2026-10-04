import { inGameTestIds } from "../../src/screens/InGameTestIds.ts";
import { DevDrawer } from "./DevDrawer.ts";
import { Hud } from "./Hud.ts";
import { MapPanel } from "./MapPanel.ts";
import { PaintTools } from "./PaintTools.ts";
import { PlayersPanel } from "./PlayersPanel.ts";
import { RevealPage } from "./RevealPage.ts";
import { RoundDonePage } from "./RoundDonePage.ts";
import { Screen } from "./Screen.ts";
import { TurnedAwayPage } from "./TurnedAwayPage.ts";
import { isUsable, text } from "./support.ts";
import type { Tab } from "./Tab.ts";

/** An online round you are playing: paint, then Done (or Pass). */
export class RoundPage extends Screen {
  readonly hud: Hud;
  readonly map: MapPanel;
  readonly paintTools: PaintTools;
  readonly playersPanel: PlayersPanel;
  readonly devDrawer: DevDrawer;

  static async whenShown(tab: Tab, timeoutMs = 15_000): Promise<RoundPage> {
    const round = new RoundPage(tab);
    await tab.page.getByTestId(inGameTestIds.doneButton).waitFor({ timeout: timeoutMs });
    await round.paintTools.waitUntilEnabled(timeoutMs);
    await round.map.waitUntilSettled();
    return round;
  }

  constructor(tab: Tab) {
    super(tab);
    this.hud = new Hud(tab);
    this.map = new MapPanel(tab.page);
    this.paintTools = new PaintTools(tab.page);
    this.playersPanel = new PlayersPanel(tab.page);
    this.devDrawer = new DevDrawer(tab.page);
  }

  /** "Done", or "Pass" while nothing is painted. */
  async doneButtonLabel(): Promise<string> {
    return text(this.page.getByTestId(inGameTestIds.doneButton));
  }

  async doneButtonIsUsable(): Promise<boolean> {
    return isUsable(this.page.getByTestId(inGameTestIds.doneButton));
  }

  /** Done (or a pass), while others are still guessing. */
  async finish(): Promise<RoundDonePage> {
    await this.page.getByTestId(inGameTestIds.doneButton).click();
    return RoundDonePage.whenShown(this.tab);
  }

  /** Done (or a pass) as the last one guessing, which ends the round. */
  async finishLast(): Promise<RevealPage> {
    await this.page.getByTestId(inGameTestIds.doneButton).click();
    return RevealPage.whenShown(this.tab);
  }

  /** Whether the round is still under way for you. */
  async isStillShown(): Promise<boolean> {
    return (await this.page.getByTestId(inGameTestIds.doneButton).count()) > 0;
  }

  /** Refresh the page mid-round: you keep your seat and your paint. */
  async reload(): Promise<RoundPage> {
    await this.page.reload({ waitUntil: "networkidle" });
    return RoundPage.whenShown(this.tab);
  }

  /** Until the clock runs out. */
  async waitForReveal(timeoutMs = 20_000): Promise<RevealPage> {
    return RevealPage.whenShown(this.tab, timeoutMs);
  }

  /** Until the host removes you from the game. */
  async waitUntilRemoved(): Promise<TurnedAwayPage> {
    return TurnedAwayPage.whenShown(this.tab);
  }
}
