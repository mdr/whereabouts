import { expect } from "@playwright/test"
import { resultsTestIds } from "../../src/screens/results/Results/ResultsTestIds.ts"
import { roundListTestIds } from "../../src/screens/results/RoundList/RoundListTestIds.ts"
import { roundsTestIds } from "../../src/screens/results/Rounds/RoundsTestIds.ts"
import { scoreTableTestIds } from "../../src/screens/results/ScoreTable/ScoreTableTestIds.ts"
import { standingsTestIds } from "../../src/screens/results/Standings/StandingsTestIds.ts"
import { smallFlagButtonTestIds } from "../../src/ui/pictures/SmallFlagButton/SmallFlagButtonTestIds.ts"
import { FlagPicture } from "./components/FlagPicture.ts"
import { LobbyPage } from "./LobbyPage.ts"
import { Screen } from "./Screen.ts"
import { byTestIdWith } from "./support.ts"
import type { Tab } from "./Tab.ts"
import type { Ms } from "@whereabouts/shared/units"

const MEDALS = ["🥇", "🥈", "🥉"]

/** The final standings. */
export class ResultsPage extends Screen {
  /** The flag beside a flag round in the list of rounds. */
  get roundFlag(): FlagPicture {
    return new FlagPicture(this.page, this.page.getByTestId(smallFlagButtonTestIds.flag))
  }

  static async whenShown(tab: Tab, timeout: Ms = 10_000): Promise<ResultsPage> {
    await expect(tab.page.getByTestId(resultsTestIds.page), "the final standings are shown").toBeVisible({ timeout })
    return new ResultsPage(tab)
  }

  async expectStandingsCount(count: number): Promise<void> {
    await expect(
      this.page.getByTestId(standingsTestIds.standingsRow),
      `the final standings list ${count} players`
    ).toHaveCount(count)
  }

  async expectWinner(name: string): Promise<void> {
    const winner = this.page.getByTestId(resultsTestIds.winner)
    await expect(winner, `${name} is named the winner`).toContainText(name)
    await expect(winner, "the winner is announced").toContainText("wins")
  }

  /** `total` as the standings write it, e.g. "1,500". */
  async expectStanding(place: number, name: string, total: string): Promise<void> {
    const row = byTestIdWith(this.page, standingsTestIds.standingsRow, "player", name)
    await expect(row.getByTestId(standingsTestIds.place), `${name} is in place ${place}`).toHaveText(
      MEDALS[place - 1] ?? String(place)
    )
    await expect(row.getByTestId(standingsTestIds.total), `${name}'s total`).toHaveText(total)
  }

  async expectStandingIsYou(name: string, isYou: boolean): Promise<void> {
    const row = byTestIdWith(this.page, standingsTestIds.standingsRow, "player", name)
    if (isYou) await expect(row, `${name}'s row is marked as yours`).toHaveAttribute("aria-current", "true")
    else await expect(row, `${name}'s row is not marked as yours`).not.toHaveAttribute("aria-current")
  }

  /** `score` as the reveal gave the round's score: "+412", or "sat out". */
  async expectRoundScore(round: number, name: string, score: string): Promise<void> {
    const cell = byTestIdWith(
      this.page.getByTestId(roundsTestIds.playedRound).nth(round - 1),
      scoreTableTestIds.score,
      "player",
      name
    )
    await expect(cell, `${name}'s score in round ${round}`).toHaveText(score === "sat out" ? "–" : score.slice(1))
  }

  /** A guest: no Play again, just a note that the host can start another game. */
  async expectCannotPlayAgain(): Promise<void> {
    await expect(
      this.page.getByTestId(resultsTestIds.cannotPlayAgain),
      "a note says the host starts the next game"
    ).toBeVisible()
    await expect(this.page.getByTestId(resultsTestIds.playAgainButton), "there is no Play again button").toHaveCount(0)
  }

  /** The host's Play again is held, and the page says why, while the connection is down. */
  async expectPlayAgainHeldReconnecting(): Promise<void> {
    await expect(this.page.getByTestId(resultsTestIds.playAgainButton), "Play again is held").toBeDisabled()
    await expect(this.page.getByRole("status"), "the page says it is reconnecting").toHaveText("Reconnecting…")
  }

  async expectPlayAgainAvailable(): Promise<void> {
    await expect(this.page.getByTestId(resultsTestIds.playAgainButton), "Play again is available").toBeEnabled({
      timeout: 20_000
    })
  }

  /** Where the table won't fit: a line per round with its winner and your score. */
  async expectRoundsListed(rounds: number): Promise<void> {
    await expect(this.page.getByTestId(roundListTestIds.roundWinner), "each round names its winner").toHaveCount(rounds)
    await expect(this.page.getByTestId(roundListTestIds.roundYours), "each round shows your score").toHaveCount(rounds)
    await expect(this.page.getByTestId(scoreTableTestIds.table), "the full table is not shown").toHaveCount(0)
  }

  async showEveryonesScores(playerCount: number): Promise<void> {
    const toggle = this.page.getByTestId(roundsTestIds.everyoneToggle)
    await expect(toggle, "the toggle offers everyone's scores").toHaveText(`Everyone's scores (${playerCount})`)
    await toggle.click()
    await expect(this.page.getByTestId(scoreTableTestIds.table), "the full table is shown").toHaveCount(1)
    await expect(toggle, "the toggle offers the winners again").toHaveText("Just the winners")
  }

  async showJustTheWinners(rounds: number): Promise<void> {
    await this.page.getByTestId(roundsTestIds.everyoneToggle).click()
    await this.expectRoundsListed(rounds)
  }

  /** Host: everyone back to the same lobby. */
  async playAgain(): Promise<LobbyPage> {
    await this.page.getByTestId(resultsTestIds.playAgainButton).click()
    return LobbyPage.whenShown(this.tab, 10_000)
  }

  async waitForLobby(): Promise<LobbyPage> {
    return LobbyPage.whenShown(this.tab, 10_000)
  }
}
