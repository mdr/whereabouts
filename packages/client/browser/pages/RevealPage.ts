import { revealTestIds } from "../../src/screens/RevealTestIds.ts";
import { Hud } from "./Hud.ts";
import { MapPanel } from "./MapPanel.ts";
import { ResultsPage } from "./ResultsPage.ts";
import { RoundPage } from "./RoundPage.ts";
import { Screen } from "./Screen.ts";
import { byTestIdWith, isUsable, text, until } from "./support.ts";
import type { Tab } from "./Tab.ts";

export interface RevealRow {
  name: string;
  /** "+412", or "sat out". */
  roundScore: string;
  passed: boolean;
}

/** An online round's reveal: the answer, everyone's scores, and getting ready for the next. */
export class RevealPage extends Screen {
  readonly hud: Hud;
  readonly map: MapPanel;

  static async whenShown(tab: Tab, timeoutMs = 10_000): Promise<RevealPage> {
    const reveal = new RevealPage(tab);
    await tab.page.getByTestId(revealTestIds.scoresList).waitFor({ timeout: timeoutMs });
    await reveal.map.waitUntilSettled();
    return reveal;
  }

  constructor(tab: Tab) {
    super(tab);
    this.hud = new Hud(tab);
    this.map = new MapPanel(tab.page);
  }

  async isStillShown(): Promise<boolean> {
    return (await this.page.getByTestId(revealTestIds.scoresList).count()) > 0;
  }

  /** The players' rows, in the order shown. */
  async rows(): Promise<RevealRow[]> {
    const rows = await this.page.getByTestId(revealTestIds.playerRow).all();
    return Promise.all(
      rows.map(async (row) => ({
        name: await text(row.getByTestId(revealTestIds.playerName)),
        roundScore: await text(row.getByTestId(revealTestIds.roundScore)),
        passed: (await row.getByTestId(revealTestIds.passedTag).count()) > 0,
      })),
    );
  }

  /** Show just this player's paint. */
  async showOnly(name: string): Promise<void> {
    await byTestIdWith(this.page, revealTestIds.playerRow, "player", name).click();
    await this.map.waitUntilSettled();
  }

  /** Hide everyone's paint, or bring it back if hidden. */
  async toggleHidePaint(): Promise<void> {
    await this.page.getByTestId(revealTestIds.hidePaintRow).click();
    await this.map.waitUntilSettled();
  }

  /** "1 / 2 ready" */
  async readyCount(): Promise<string> {
    return text(this.page.getByTestId(revealTestIds.readyCount));
  }

  async waitForReadyCount(expected: string): Promise<void> {
    await until(
      `ready count "${expected}"`,
      () => this.readyCount(),
      (c) => c === expected,
      5_000,
    );
  }

  /** Ready, while others are not yet. */
  async ready(): Promise<void> {
    await this.page.getByTestId(revealTestIds.readyButton).click();
  }

  /** Ready as the last one, which starts the next round. */
  async readyLast(): Promise<RoundPage> {
    await this.page.getByTestId(revealTestIds.readyButton).click();
    return RoundPage.whenShown(this.tab, 10_000);
  }

  /** Host: Next round, without waiting for everyone to be ready. */
  async nextRound(): Promise<RoundPage> {
    await this.page.getByTestId(revealTestIds.nextButton).click();
    return RoundPage.whenShown(this.tab, 10_000);
  }

  /** Host, after the last round. */
  async showFinalResults(): Promise<ResultsPage> {
    await this.page.getByTestId(revealTestIds.nextButton).click();
    return ResultsPage.whenShown(this.tab);
  }

  async waitForNextRound(timeoutMs = 10_000): Promise<RoundPage> {
    return RoundPage.whenShown(this.tab, timeoutMs);
  }

  async waitForResults(timeoutMs = 10_000): Promise<ResultsPage> {
    return ResultsPage.whenShown(this.tab, timeoutMs);
  }

  async readyButtonIsUsable(): Promise<boolean> {
    return isUsable(this.page.getByTestId(revealTestIds.readyButton));
  }

  async scoresAreUsable(): Promise<boolean> {
    return isUsable(this.page.getByTestId(revealTestIds.everyoneRow));
  }
}
