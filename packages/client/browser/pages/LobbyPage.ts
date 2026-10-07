import type { QuestionType } from "@whereabouts/shared"
import { lobbyTestIds, setupSummaryTestIds } from "../../src/screens/LobbyTestIds.ts"
import { mixEditorTestIds } from "../../src/ui/MixEditorTestIds.ts"
import { pillsTestIds, stepperTestIds } from "../../src/ui/ControlsTestIds.ts"
import { PlayerList } from "./PlayerList.ts"
import { RoundPage } from "./RoundPage.ts"
import { Screen } from "./Screen.ts"
import { byTestIdWith, text, until } from "./support.ts"
import type { Tab } from "./Tab.ts"

export interface SetupSummary {
  rounds: string
  seconds: string
  questions: string
}

/** The waiting room: the code to share, who is here, and the game setup. */
export class LobbyPage extends Screen {
  readonly players: PlayerList

  static async whenShown(tab: Tab, timeoutMs = 15_000): Promise<LobbyPage> {
    await tab.page.getByTestId(lobbyTestIds.page).waitFor({ timeout: timeoutMs })
    return new LobbyPage(tab)
  }

  constructor(tab: Tab) {
    super(tab)
    this.players = new PlayerList(tab.page.getByTestId(lobbyTestIds.page))
  }

  async code(): Promise<string> {
    return text(this.page.getByTestId(lobbyTestIds.code))
  }

  /** Host: set how many rounds ask this kind of question, one step at a time. */
  async setQuestionCount(type: QuestionType, count: number): Promise<void> {
    const row = byTestIdWith(this.page, mixEditorTestIds.row, "type", type)
    const value = row.getByTestId(stepperTestIds.value)
    for (;;) {
      const now = Number(await text(value))
      if (now === count) return
      const up = now < count
      await row.getByTestId(up ? stepperTestIds.moreButton : stepperTestIds.fewerButton).click()
      const next = String(up ? now + 1 : now - 1)
      await until(
        `${type} count ${next}`,
        () => text(value),
        (v) => v === next
      )
    }
  }

  /** Host: every round asks this kind of question. */
  async setOnlyQuestions(type: QuestionType, count: number): Promise<void> {
    await this.setQuestionCount(type, count)
    for (const other of ["landmarks", "places", "countries", "flags"] as const) {
      if (other !== type) await this.setQuestionCount(other, 0)
    }
  }

  async chooseSecondsPerRound(seconds: number): Promise<void> {
    await byTestIdWith(
      this.page.getByTestId(lobbyTestIds.secondsSetting),
      pillsTestIds.option,
      "value",
      String(seconds * 1000)
    ).click()
  }

  /** Whether this player has the host's setup controls. */
  async canChangeSetup(): Promise<boolean> {
    const controls =
      (await this.page.getByTestId(lobbyTestIds.questionsSetting).count()) +
      (await this.page.getByTestId(lobbyTestIds.secondsSetting).count())
    return controls > 0
  }

  /** A guest's view of the setup the host chose. */
  async setupSummary(): Promise<SetupSummary> {
    const value = (id: string) => text(this.page.getByTestId(id).getByTestId(setupSummaryTestIds.tileValue))
    return {
      rounds: await value(setupSummaryTestIds.rounds),
      seconds: await value(setupSummaryTestIds.seconds),
      questions: await text(this.page.getByTestId(setupSummaryTestIds.questions))
    }
  }

  async waitForSetupSummary(expected: SetupSummary): Promise<void> {
    await until(
      `setup summary ${JSON.stringify(expected)}`,
      () => this.setupSummary(),
      (s) => s.rounds === expected.rounds && s.seconds === expected.seconds && s.questions === expected.questions
    )
  }

  /** Host only. */
  async startGame(): Promise<RoundPage> {
    await this.page.getByTestId(lobbyTestIds.startButton).click()
    return RoundPage.whenShown(this.tab)
  }

  /** A guest waiting for the host to start. */
  async waitForGameToStart(): Promise<RoundPage> {
    return RoundPage.whenShown(this.tab)
  }
}
