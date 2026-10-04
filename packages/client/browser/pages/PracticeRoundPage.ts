import { soloTestIds } from "../../src/screens/SoloTestIds.ts";
import { DevDrawer } from "./DevDrawer.ts";
import { Hud } from "./Hud.ts";
import { MapPanel } from "./MapPanel.ts";
import { PaintTools } from "./PaintTools.ts";
import { PracticeRevealPage } from "./PracticeRevealPage.ts";
import { Screen } from "./Screen.ts";
import type { Tab } from "./Tab.ts";

/** A practice question: paint, then Submit. */
export class PracticeRoundPage extends Screen {
  readonly hud: Hud;
  readonly map: MapPanel;
  readonly paintTools: PaintTools;
  readonly devDrawer: DevDrawer;

  static async whenShown(tab: Tab): Promise<PracticeRoundPage> {
    const round = new PracticeRoundPage(tab);
    await tab.page.getByTestId(soloTestIds.submitButton).waitFor({ timeout: 30_000 });
    await round.map.waitUntilSettled();
    return round;
  }

  constructor(tab: Tab) {
    super(tab);
    this.hud = new Hud(tab);
    this.map = new MapPanel(tab.page);
    this.paintTools = new PaintTools(tab.page);
    this.devDrawer = new DevDrawer(tab.page);
  }

  async submit(): Promise<PracticeRevealPage> {
    await this.page.getByTestId(soloTestIds.submitButton).click();
    return PracticeRevealPage.whenShown(this.tab);
  }
}
