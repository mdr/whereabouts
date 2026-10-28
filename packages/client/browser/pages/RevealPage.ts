import { revealTestIds } from "../../src/screens/RevealTestIds.ts"
import { factTestIds, hudHeaderTestIds } from "../../src/ui/bitsTestIds.ts"
import { Hud } from "./Hud.ts"
import { MapPanel } from "./MapPanel.ts"
import { ResultsPage } from "./ResultsPage.ts"
import { RoundPage } from "./RoundPage.ts"
import { Screen } from "./Screen.ts"
import { byTestIdWith, isUsable, text, until } from "./support.ts"
import type { Tab } from "./Tab.ts"

export interface RevealRow {
  name: string
  /** "+412", or "sat out". */
  roundScore: string
  passed: boolean
  hinted: boolean
}

/** An online round's reveal: the answer, everyone's scores, and getting ready for the next. */
export class RevealPage extends Screen {
  readonly hud: Hud
  readonly map: MapPanel

  static async whenShown(tab: Tab, timeoutMs = 10_000): Promise<RevealPage> {
    const reveal = new RevealPage(tab)
    await tab.page.getByTestId(revealTestIds.scoresList).waitFor({ timeout: timeoutMs })
    await reveal.map.waitUntilSettled()
    return reveal
  }

  constructor(tab: Tab) {
    super(tab)
    this.hud = new Hud(tab)
    this.map = new MapPanel(tab.page)
  }

  async isStillShown(): Promise<boolean> {
    return (await this.page.getByTestId(revealTestIds.scoresList).count()) > 0
  }

  /** The line of interest about the answer, once the facts have loaded. */
  async fact(): Promise<string> {
    return text(this.page.getByTestId(factTestIds.fact))
  }

  /** The players' rows, in the order shown. */
  async rows(): Promise<RevealRow[]> {
    const rows = await this.page.getByTestId(revealTestIds.playerRow).all()
    return Promise.all(
      rows.map(async (row) => ({
        name: await text(row.getByTestId(revealTestIds.playerName)),
        roundScore: await text(row.getByTestId(revealTestIds.roundScore)),
        passed: (await row.getByTestId(revealTestIds.passedTag).count()) > 0,
        hinted: (await row.getByTestId(revealTestIds.hintTag).count()) > 0
      }))
    )
  }

  /** Show just this player's paint. */
  async showOnly(name: string): Promise<void> {
    await byTestIdWith(this.page, revealTestIds.playerRow, "player", name).click()
    await this.map.waitUntilSettled()
  }

  /** Rest the mouse on this player's name. */
  async hoverPlayer(name: string): Promise<void> {
    await byTestIdWith(this.page, revealTestIds.playerRow, "player", name).hover()
    await this.map.waitUntilSettled()
  }

  /** Move the mouse off the scores, onto the map. */
  async stopHovering(): Promise<void> {
    await this.map.hover({ across: 0.5, down: 0.5 })
    await this.map.waitUntilSettled()
  }

  /** Hide everyone's paint, or bring it back if hidden. */
  async toggleHidePaint(): Promise<void> {
    await this.page.getByTestId(revealTestIds.hidePaintRow).click()
    await this.map.waitUntilSettled()
  }

  /** "1 / 2 ready" */
  async readyCount(): Promise<string> {
    return text(this.page.getByTestId(revealTestIds.readyCount))
  }

  async waitForReadyCount(expected: string): Promise<void> {
    await until(
      `ready count "${expected}"`,
      () => this.readyCount(),
      (c) => c === expected,
      5_000
    )
  }

  /** Ready, while others are not yet. */
  async ready(): Promise<void> {
    await this.page.getByTestId(revealTestIds.readyButton).click()
  }

  /** Ready as the last one, which starts the next round. */
  async readyLast(): Promise<RoundPage> {
    await this.page.getByTestId(revealTestIds.readyButton).click()
    return RoundPage.whenShown(this.tab, 10_000)
  }

  /** Host: Next round, without waiting for everyone to be ready. */
  async nextRound(): Promise<RoundPage> {
    await this.page.getByTestId(revealTestIds.nextButton).click()
    return RoundPage.whenShown(this.tab, 10_000)
  }

  /** Host, after the last round. */
  async showFinalResults(): Promise<ResultsPage> {
    await this.page.getByTestId(revealTestIds.nextButton).click()
    return ResultsPage.whenShown(this.tab)
  }

  async waitForNextRound(timeoutMs = 10_000): Promise<RoundPage> {
    return RoundPage.whenShown(this.tab, timeoutMs)
  }

  async waitForResults(timeoutMs = 10_000): Promise<ResultsPage> {
    return ResultsPage.whenShown(this.tab, timeoutMs)
  }

  async readyButtonIsUsable(): Promise<boolean> {
    return isUsable(this.page.getByTestId(revealTestIds.readyButton))
  }

  /** On a phone the scores are further down the sheet: scrolled to first. */
  async scoresAreUsable(): Promise<boolean> {
    const row = this.page.getByTestId(revealTestIds.everyoneRow)
    // Not scrollIntoViewIfNeeded: a row under the sticky toolbar counts as in view.
    await row.evaluate((el) => el.scrollIntoView({ block: "center" }))
    return isUsable(row)
  }

  async scoreIsUsable(): Promise<boolean> {
    return isUsable(this.page.getByTestId(revealTestIds.scoreCard))
  }

  /** On a phone, whether the answer shows in full on the map between the header and the sheet of cards. */
  async answerShowsAboveSheet(): Promise<boolean> {
    const header = await this.page.getByTestId(hudHeaderTestIds.header).boundingBox()
    const sheet = await this.page.getByTestId(revealTestIds.scoreCard).boundingBox()
    if (!header || !sheet) return false
    return (await this.map.answerShareBetween(header.y + header.height, sheet.y)) === 1
  }
}
