import { expect, type Locator } from "@playwright/test"
import { QUESTION_TYPES, type QuestionType } from "@whereabouts/shared/questions"
import { lobbyTestIds } from "../../src/screens/lobby/Lobby/LobbyTestIds.ts"
import { invitePanelTestIds } from "../../src/screens/lobby/invite/InvitePanel/InvitePanelTestIds.ts"
import { hostSettingsTestIds } from "../../src/screens/lobby/setup/HostSettings/HostSettingsTestIds.ts"
import { setupPanelTestIds } from "../../src/screens/lobby/setup/SetupPanel/SetupPanelTestIds.ts"
import { setupSummaryTestIds } from "../../src/screens/lobby/setup/SetupSummary/SetupSummaryTestIds.ts"
import { mixEditorTestIds } from "../../src/ui/setup/MixEditor/MixEditorTestIds.ts"
import { pillsTestIds } from "../../src/ui/setup/Pills/PillsTestIds.ts"
import { stepperTestIds } from "../../src/ui/setup/Stepper/StepperTestIds.ts"
import { PlayerList } from "./components/PlayerList.ts"
import { RoundPage } from "./RoundPage.ts"
import { Screen } from "./Screen.ts"
import { byTestIdWith, text } from "./support.ts"
import type { Tab } from "./Tab.ts"
import type { Ms, Seconds } from "@whereabouts/shared/units"

export interface SetupSummary {
  rounds: string
  seconds: string
  questions: string
}

/** The waiting room: the code to share, who is here, and the game setup. */
export class LobbyPage extends Screen {
  readonly players: PlayerList

  static async whenShown(tab: Tab, timeout: Ms = 15_000): Promise<LobbyPage> {
    await expect(tab.page.getByTestId(lobbyTestIds.page), "the lobby is shown").toBeVisible({ timeout })
    return new LobbyPage(tab)
  }

  constructor(tab: Tab) {
    super(tab)
    this.players = new PlayerList(tab.page.getByTestId(lobbyTestIds.page))
  }

  async code(): Promise<string> {
    return text(this.page.getByTestId(invitePanelTestIds.code))
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
      await expect(value, `the ${type} count reads ${next}`).toHaveText(next)
    }
  }

  /** Host: every round asks this type of question. */
  async setOnlyQuestions(type: QuestionType, count: number): Promise<void> {
    await this.setQuestionCount(type, count)
    for (const other of QUESTION_TYPES) if (other !== type) await this.setQuestionCount(other, 0)
  }

  async chooseSecondsPerRound(seconds: Seconds): Promise<void> {
    await byTestIdWith(
      this.page.getByTestId(hostSettingsTestIds.secondsSetting),
      pillsTestIds.option,
      "value",
      String(seconds * 1000)
    ).click()
  }

  /** A guest's view of the setup the host chose. */
  async expectSetupSummary(expected: SetupSummary): Promise<void> {
    const tile = (id: string): Locator => this.page.getByTestId(id).getByTestId(setupSummaryTestIds.tileValue)
    await expect(tile(setupSummaryTestIds.rounds), `the setup shows ${expected.rounds} rounds`).toHaveText(
      expected.rounds
    )
    await expect(tile(setupSummaryTestIds.seconds), `the setup shows ${expected.seconds} a round`).toHaveText(
      expected.seconds
    )
    await expect(
      this.page.getByTestId(setupSummaryTestIds.questions),
      `the setup shows ${expected.questions}`
    ).toHaveText(expected.questions)
  }

  /** A guest sees the setup but none of the host's controls for it. */
  async expectCannotChangeSetup(): Promise<void> {
    await expect(this.page.getByTestId(setupSummaryTestIds.questions), "the guest sees the setup").toBeVisible()
    await expect(
      this.page.getByTestId(hostSettingsTestIds.questionsSetting),
      "the guest has no question controls"
    ).toHaveCount(0)
    await expect(
      this.page.getByTestId(hostSettingsTestIds.secondsSetting),
      "the guest has no seconds control"
    ).toHaveCount(0)
  }

  async expectCode(code: string): Promise<void> {
    await expect(this.page.getByTestId(invitePanelTestIds.code), `the lobby code is ${code}`).toHaveText(code)
  }

  /** Host only. */
  async startGame(): Promise<RoundPage> {
    await this.page.getByTestId(setupPanelTestIds.startButton).click()
    return RoundPage.whenShown(this.tab)
  }

  /** A guest waiting for the host to start. */
  async waitForGameToStart(): Promise<RoundPage> {
    return RoundPage.whenShown(this.tab)
  }
}
