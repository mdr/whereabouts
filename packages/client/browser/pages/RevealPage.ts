import { expect, type Locator } from "@playwright/test"
import { revealTestIds } from "../../src/screens/reveal/Reveal/RevealTestIds.ts"
import { revealRowTestIds } from "../../src/screens/reveal/RevealRow/RevealRowTestIds.ts"
import { revealScoresTestIds } from "../../src/screens/reveal/RevealScores/RevealScoresTestIds.ts"
import { questionCardTestIds } from "../../src/ui/round/question/QuestionCard/QuestionCardTestIds.ts"
import { answerTestIds } from "../../src/ui/round/question/Answer/AnswerTestIds.ts"
import { paintedInTestIds } from "../../src/ui/round/flag-reveal/PaintedIn/PaintedInTestIds.ts"
import { factLineTestIds } from "../../src/ui/round/question/FactLine/FactLineTestIds.ts"
import { lookalikeFlagsTestIds } from "../../src/ui/round/flag-reveal/LookalikeFlags/LookalikeFlagsTestIds.ts"
import { rankArrowTestIds } from "../../src/ui/players/RankArrow/RankArrowTestIds.ts"
import { RankMove } from "../../src/ui/players/rank-move.ts"
import { Hud } from "./components/Hud.ts"
import { LookalikeCompare } from "./components/LookalikeCompare.ts"
import { MapPanel } from "./components/MapPanel.ts"
import { QuestionCard } from "./components/QuestionCard.ts"
import { ResultsPage } from "./ResultsPage.ts"
import { RoundPage } from "./RoundPage.ts"
import { Screen } from "./Screen.ts"
import { byTestIdWith, expectPolled, expectUsable, softExpect, stillTrueFor, text } from "./support.ts"
import type { Tab } from "./Tab.ts"
import type { Ms } from "@whereabouts/shared/units"

interface ExpectedRow {
  /** "+412", or "sat out". */
  roundScore?: string
  passed?: boolean
  hinted?: boolean
}

/** An online round's reveal: the answer, everyone's scores, and getting ready for the next. */
export class RevealPage extends Screen {
  readonly hud: Hud
  readonly questionCard: QuestionCard
  readonly map: MapPanel

  static async whenShown(tab: Tab, timeout: Ms = 10_000): Promise<RevealPage> {
    const reveal = new RevealPage(tab)
    await expect(tab.page.getByTestId(revealScoresTestIds.scoresList), "the reveal is shown").toBeVisible({ timeout })
    await reveal.map.waitUntilSettled()
    return reveal
  }

  constructor(tab: Tab) {
    super(tab)
    this.hud = new Hud(tab)
    this.questionCard = new QuestionCard(tab.page)
    this.map = new MapPanel(tab.page)
  }

  #row(name: string): Locator {
    return byTestIdWith(this.page, revealRowTestIds.playerRow, "player", name)
  }

  /** The reveal keeps showing for `duration`. */
  async expectStaysShown(duration: Ms = 800): Promise<void> {
    const scores = this.page.getByTestId(revealScoresTestIds.scoresList)
    await expect(scores, "the reveal is shown").toBeVisible()
    await stillTrueFor(
      "still being on the reveal",
      duration,
      () => scores.count(),
      (count) => count > 0
    )
  }

  /** The line of interest about the answer, once the facts have loaded. */
  async fact(): Promise<string> {
    return text(this.page.getByTestId(factLineTestIds.fact))
  }

  async expectFactLine(): Promise<void> {
    await expect(this.page.getByTestId(factLineTestIds.fact), "there is a line about the answer").toHaveText(/.{21}/)
  }

  async expectFact(fact: string): Promise<void> {
    await expect(this.page.getByTestId(factLineTestIds.fact), "the line about the answer matches").toHaveText(fact)
  }

  /** On a part of a country: whose it is, after its name. */
  async expectPartOf(status: string): Promise<void> {
    await expect(this.page.getByTestId(answerTestIds.partOf), "the answer says whose it is").toHaveText(`, ${status}`)
  }

  /** A flag round: open its look-alikes large, from the given one of the small flags (0, the answer's, first). */
  async compareLookalikes(from = 0): Promise<LookalikeCompare> {
    await this.page.getByTestId(lookalikeFlagsTestIds.enlarge).nth(from).click()
    const compare = new LookalikeCompare(this.page)
    await compare.expectOpen()
    return compare
  }

  async expectRowCount(count: number): Promise<void> {
    await expect(this.page.getByTestId(revealRowTestIds.playerRow), `the reveal lists ${count} players`).toHaveCount(
      count
    )
  }

  /** A player's row, with whatever of its score and tags is given. */
  async expectRow(name: string, expected: ExpectedRow): Promise<void> {
    const row = this.#row(name)
    await expect(row, `${name} has a row on the reveal`).toBeVisible()
    if (expected.roundScore !== undefined) {
      await expect(row.getByTestId(revealRowTestIds.roundScore), `${name}'s round score`).toHaveText(
        expected.roundScore
      )
    }
    if (expected.passed !== undefined) {
      await expect(
        row.getByTestId(revealRowTestIds.passedTag),
        expected.passed ? `${name} is tagged as passed` : `${name} is not tagged as passed`
      ).toHaveCount(expected.passed ? 1 : 0)
    }
    if (expected.hinted !== undefined) {
      await expect(
        row.getByTestId(revealRowTestIds.hintTag),
        expected.hinted ? `${name} is tagged as having used a hint` : `${name} is not tagged as having used a hint`
      ).toHaveCount(expected.hinted ? 1 : 0)
    }
  }

  /** A flag round: the country most of this player's paint was in, with its share and whether it is the answer. */
  async expectPaintedIn(name: string, country: string, title: RegExp): Promise<void> {
    const paintedIn = this.#row(name).getByTestId(paintedInTestIds.paintedIn)
    await expect(paintedIn, `${name}'s row names where their paint was`).toContainText(country)
    await expect(paintedIn, `${name}'s paint, in words`).toHaveAttribute("title", title)
  }

  /** Every player's row as shown, in order. */
  async rows(): Promise<{ name: string; roundScore: string; total: string }[]> {
    const rows = this.page.getByTestId(revealRowTestIds.playerRow)
    return Promise.all(
      (await rows.all()).map(async (row) => ({
        name: (await row.getAttribute("data-player")) ?? "",
        roundScore: await text(row.getByTestId(revealRowTestIds.roundScore)),
        total: await text(row.getByTestId(revealRowTestIds.total))
      }))
    )
  }

  /** Whether a player's rank rose, fell or held over the round. */
  async expectRankMove(name: string, move: RankMove): Promise<void> {
    await expect(
      this.#row(name).getByTestId(rankArrowTestIds.arrow),
      `${name}'s rank ${move === RankMove.SAME ? "held" : move === RankMove.UP ? "rose" : "fell"}`
    ).toHaveAttribute("data-move", move)
  }

  /** `rowCount` rows are listed, and none of the names carries a "(you)" label. */
  async expectNoYouLabels(rowCount: number): Promise<void> {
    await this.expectRowCount(rowCount)
    await expect(
      this.page.getByTestId(revealRowTestIds.playerName).filter({ hasText: "(you)" }),
      "nobody is labelled (you)"
    ).toHaveCount(0)
  }

  /** Show just this player's paint. */
  async showOnly(name: string): Promise<void> {
    await this.#row(name).click()
    await this.map.waitUntilSettled()
  }

  /** Rest the mouse on this player's name. */
  async hoverPlayer(name: string): Promise<void> {
    await this.#row(name).hover()
    await this.map.waitUntilSettled()
  }

  /** Move the mouse off the scores, onto the map. */
  async stopHovering(): Promise<void> {
    await this.map.hover({ across: 0.5, down: 0.5 })
    await this.map.waitUntilSettled()
  }

  /** Hide everyone's paint, or bring it back if hidden. */
  async toggleHidePaint(): Promise<void> {
    await this.page.getByTestId(revealScoresTestIds.hidePaintRow).click()
    await this.map.waitUntilSettled()
  }

  /** "1 of 2 ready" */
  async expectReadyCount(expected: string): Promise<void> {
    await expect(this.page.getByTestId(revealTestIds.readyCount), `the reveal says ${expected}`).toHaveText(expected, {
      timeout: 5_000
    })
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

  /** Press Enter, expecting nothing of it. */
  async pressEnter(): Promise<void> {
    await this.page.keyboard.press("Enter")
  }

  /** Host: Next round by pressing Enter. */
  async nextRoundWithKeyboard(): Promise<RoundPage> {
    await this.page.keyboard.press("Enter")
    return RoundPage.whenShown(this.tab, 10_000)
  }

  /** Host, after the last round. */
  async showFinalResults(): Promise<ResultsPage> {
    await this.page.getByTestId(revealTestIds.nextButton).click()
    return ResultsPage.whenShown(this.tab)
  }

  async waitForNextRound(timeout: Ms = 10_000): Promise<RoundPage> {
    return RoundPage.whenShown(this.tab, timeout)
  }

  async waitForResults(timeout: Ms = 10_000): Promise<ResultsPage> {
    return ResultsPage.whenShown(this.tab, timeout)
  }

  async expectReadyButtonUsable(message = "the Ready button is on screen and uncovered"): Promise<void> {
    await expectUsable(this.page.getByTestId(revealTestIds.readyButton), message)
  }

  /** On a phone the scores are further down the sheet: scrolled to first. */
  async expectScoresUsable(): Promise<void> {
    const row = this.page.getByTestId(revealScoresTestIds.everyoneRow)
    // Not scrollIntoViewIfNeeded: a row under the sticky toolbar counts as in view.
    await row.evaluate((element) => element.scrollIntoView({ block: "center" }))
    await expectUsable(row, "the scores list is on screen and uncovered")
  }

  async expectScoreCardUsable(): Promise<void> {
    await expectUsable(this.page.getByTestId(revealTestIds.scoreCard), "your score card is on screen and uncovered")
  }

  /** On a phone, the answer shows in full on the map between the question card and the sheet of cards. */
  async expectAnswerShowsAboveSheet(): Promise<void> {
    await this.map.waitUntilSettled()
    await expectPolled(
      "the answer shows in full on the map between the question card and the sheet",
      "all of the answer",
      async () => {
        const question = await this.page.getByTestId(questionCardTestIds.card).boundingBox()
        const sheet = await this.page.getByTestId(revealTestIds.scoreCard).boundingBox()
        if (!question || !sheet) return "cards not on screen"
        return (await this.map.answerShareBetween(question.y + question.height, sheet.y)) === 1
          ? "all of the answer"
          : "part of the answer is hidden"
      },
      (state) => state === "all of the answer",
      { expector: softExpect }
    )
  }

  /** The question card's line naming the answer, on screen and uncovered. */
  async expectAnswerLineUsable(): Promise<void> {
    await expectUsable(
      this.page.getByTestId(answerTestIds.answer),
      "the question card names the answer, on screen and uncovered"
    )
  }
}
