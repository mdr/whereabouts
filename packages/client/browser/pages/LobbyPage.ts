import { expect, type Locator } from "@playwright/test"
import { MAX_SPECTATORS, type MapDetail } from "@whereabouts/shared/protocol/config"
import { QUESTION_TYPES, type QuestionType } from "@whereabouts/shared/questions"
import { lobbyTestIds } from "../../src/screens/lobby/Lobby/LobbyTestIds.ts"
import { invitePanelTestIds } from "../../src/screens/lobby/invite/InvitePanel/InvitePanelTestIds.ts"
import { roleSwitchTestIds } from "../../src/screens/lobby/invite/RoleSwitch/RoleSwitchTestIds.ts"
import { rosterTestIds } from "../../src/screens/lobby/invite/Roster/RosterTestIds.ts"
import { deviceSwitchesTestIds } from "../../src/screens/lobby/setup/DeviceSwitches/DeviceSwitchesTestIds.ts"
import { hostSettingsTestIds } from "../../src/screens/lobby/setup/HostSettings/HostSettingsTestIds.ts"
import { renameFormTestIds } from "../../src/screens/lobby/invite/RenameFormTestIds.ts"
import { playerListTestIds } from "../../src/ui/players/PlayerList/PlayerListTestIds.ts"
import { setupPanelTestIds } from "../../src/screens/lobby/setup/SetupPanel/SetupPanelTestIds.ts"
import { setupSummaryTestIds } from "../../src/screens/lobby/setup/SetupSummary/SetupSummaryTestIds.ts"
import { SetupTileType } from "../../src/screens/lobby/setup/setup-tiles.ts"
import { mapDetailPickerTestIds } from "../../src/ui/setup/MapDetailPicker/MapDetailPickerTestIds.ts"
import { mixEditorTestIds } from "../../src/ui/setup/MixEditor/MixEditorTestIds.ts"
import { pillsTestIds } from "../../src/ui/setup/Pills/PillsTestIds.ts"
import { roundStripTestIds } from "../../src/ui/setup/RoundStrip/RoundStripTestIds.ts"
import { stepperTestIds } from "../../src/ui/setup/Stepper/StepperTestIds.ts"
import { ConfirmDialog } from "./components/ConfirmDialog.ts"
import { PlayerList } from "./components/PlayerList.ts"
import { HomePage } from "./HomePage.ts"
import { RoundPage } from "./RoundPage.ts"
import { Screen } from "./Screen.ts"
import { byTestIdWith, text } from "./support.ts"
import type { Tab } from "./Tab.ts"
import { WatchingPage } from "./WatchingPage.ts"
import type { Ms, Seconds } from "@whereabouts/shared/units"

export interface SetupSummary {
  rounds: string
  seconds: string
  questions: string
  hints?: string
  /** The name of the map detail, e.g. "Minimal". */
  mapDetail?: string
}

const SUMMARY_TILES: Record<SetupTileType, string> = {
  [SetupTileType.ROUNDS]: setupSummaryTestIds.rounds,
  [SetupTileType.SECONDS]: setupSummaryTestIds.seconds,
  [SetupTileType.HINTS]: setupSummaryTestIds.hints,
  [SetupTileType.QUESTIONS]: setupSummaryTestIds.questions,
  [SetupTileType.MAP_DETAIL]: setupSummaryTestIds.mapDetail
}

/** The waiting room: the code to share, who is here, and the game setup. */
export class LobbyPage extends Screen {
  readonly players: PlayerList
  /** The spectators' list under the players, once there are any. */
  readonly watchers: PlayerList

  static async whenShown(tab: Tab, timeout: Ms = 15_000): Promise<LobbyPage> {
    await expect(tab.page.getByTestId(lobbyTestIds.page), "the lobby is shown").toBeVisible({ timeout })
    return new LobbyPage(tab)
  }

  constructor(tab: Tab) {
    super(tab)
    this.players = new PlayerList(tab.page.getByTestId(lobbyTestIds.page))
    this.watchers = new PlayerList(tab.page.getByTestId(playerListTestIds.list).nth(1))
  }

  async code(): Promise<string> {
    return text(this.page.getByTestId(invitePanelTestIds.code))
  }

  /** Refresh the page: the seat is kept, and so are this device's switches. */
  async reload(): Promise<LobbyPage> {
    await this.page.reload({ waitUntil: "networkidle" })
    return LobbyPage.whenShown(this.tab)
  }

  #pill(setting: string, value: number): Locator {
    return byTestIdWith(this.page.getByTestId(setting), pillsTestIds.option, "value", String(value))
  }

  #questionRow(type: QuestionType): Locator {
    return byTestIdWith(this.page, mixEditorTestIds.row, "type", type)
  }

  #mapDetail(detail: MapDetail): Locator {
    return byTestIdWith(
      this.page.getByTestId(mapDetailPickerTestIds.picker),
      mapDetailPickerTestIds.option,
      "detail",
      detail
    )
  }

  /** Host: set how many rounds ask this kind of question, one step at a time. */
  async setQuestionCount(type: QuestionType, count: number): Promise<void> {
    const row = this.#questionRow(type)
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

  /** Host: the type's count reads `count`. */
  async expectQuestionCount(type: QuestionType, count: number): Promise<void> {
    await expect(
      this.#questionRow(type).getByTestId(stepperTestIds.value),
      `the ${type} count reads ${count}`
    ).toHaveText(String(count))
  }

  /** Host: whether the type's count has a lower step; it has none for the game's last round. */
  async expectCanLowerQuestionCount(type: QuestionType, can: boolean): Promise<void> {
    const fewer = this.#questionRow(type).getByTestId(stepperTestIds.fewerButton)
    if (can) await expect(fewer, `${type} can go lower`).toBeEnabled()
    else await expect(fewer, `${type} cannot go lower`).toBeDisabled()
  }

  /** The strip of round cells, in the host's editor or a guest's summary. */
  async expectRoundCount(count: number): Promise<void> {
    await expect(this.page.getByTestId(roundStripTestIds.cell), `the strip shows ${count} rounds`).toHaveCount(count)
  }

  async chooseSecondsPerRound(seconds: Seconds): Promise<void> {
    await this.#pill(hostSettingsTestIds.secondsSetting, seconds * 1000).click()
  }

  /** Host: this seconds-per-round choice is the one on. */
  async expectSecondsPerRound(seconds: Seconds): Promise<void> {
    await expect(
      this.#pill(hostSettingsTestIds.secondsSetting, seconds * 1000),
      `${seconds} seconds a round is chosen`
    ).toBeChecked()
  }

  async chooseHints(hints: number): Promise<void> {
    await this.#pill(hostSettingsTestIds.hintsSetting, hints).click()
  }

  /** Host: this hints-per-player choice is the one on. */
  async expectHints(hints: number): Promise<void> {
    await expect(this.#pill(hostSettingsTestIds.hintsSetting, hints), `${hints} hints are chosen`).toBeChecked()
  }

  /** Host: the hints choice has exactly one Tab stop, so Tab reaches the group once. */
  async expectHintsOneTabStop(): Promise<void> {
    await expect(
      this.page.getByTestId(hostSettingsTestIds.hintsSetting).locator('[role="radio"][tabindex="0"]'),
      "the hints choices are one Tab stop"
    ).toHaveCount(1)
  }

  /** Host: press a key on the hints choice that has the keyboard (click one first). */
  async pressKeyOnHints(key: string): Promise<void> {
    await this.page.keyboard.press(key)
  }

  /** Host: this hints choice is the one that has focus. */
  async expectHintsFocused(hints: number): Promise<void> {
    await expect(this.#pill(hostSettingsTestIds.hintsSetting, hints), `${hints} hints has focus`).toBeFocused()
  }

  /** Host: the map detail choice has exactly one Tab stop. */
  async expectMapDetailOneTabStop(): Promise<void> {
    await expect(
      this.page.getByTestId(mapDetailPickerTestIds.picker).locator('[role="radio"][tabindex="0"]'),
      "the map detail choices are one Tab stop"
    ).toHaveCount(1)
  }

  /** Host: press a key on the map detail choice that has the keyboard (click one first). */
  async pressKeyOnMapDetail(key: string): Promise<void> {
    await this.page.keyboard.press(key)
  }

  /** Host: this map detail is the one that has focus. */
  async expectMapDetailFocused(detail: MapDetail): Promise<void> {
    await expect(this.#mapDetail(detail), `${detail} map detail has focus`).toBeFocused()
  }

  async chooseMapDetail(detail: MapDetail): Promise<void> {
    await this.#mapDetail(detail).click()
  }

  /** Host: this map detail is the one chosen. */
  async expectMapDetail(detail: MapDetail): Promise<void> {
    await expect(this.#mapDetail(detail), `${detail} map detail is chosen`).toBeChecked()
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
    if (expected.hints !== undefined) {
      await expect(tile(setupSummaryTestIds.hints), `the setup shows ${expected.hints} hints`).toHaveText(
        expected.hints
      )
    }
    await expect(
      this.page.getByTestId(setupSummaryTestIds.questions),
      `the setup shows ${expected.questions}`
    ).toHaveText(expected.questions)
    if (expected.mapDetail !== undefined) {
      await expect(
        this.page.getByTestId(setupSummaryTestIds.mapDetail),
        `the setup shows the ${expected.mapDetail} map`
      ).toContainText(expected.mapDetail)
    }
  }

  /** A guest sees just these tiles of the summary marked as changed by the host. */
  async expectChangedSetup(changed: SetupTileType[]): Promise<void> {
    for (const type of Object.values(SetupTileType)) {
      const tile = this.page.getByTestId(SUMMARY_TILES[type])
      if (changed.includes(type))
        await expect(tile, `${type} is marked changed`).toHaveAttribute("data-changed", "true")
      else await expect(tile, `${type} is not marked changed`).not.toHaveAttribute("data-changed")
    }
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
    await expect(this.page.getByTestId(hostSettingsTestIds.hintsSetting), "the guest has no hints control").toHaveCount(
      0
    )
    await expect(
      this.page.getByTestId(mapDetailPickerTestIds.picker),
      "the guest has no map detail control"
    ).toHaveCount(0)
  }

  /** This device's choice to start each round on the Pan tool. */
  async setStartOnPan(on: boolean): Promise<void> {
    await this.page.getByTestId(deviceSwitchesTestIds.startOnPanSwitch).setChecked(on)
  }

  async expectStartOnPan(on: boolean): Promise<void> {
    await expect(
      this.page.getByTestId(deviceSwitchesTestIds.startOnPanSwitch),
      `starting on Pan is ${on ? "on" : "off"}`
    ).toBeChecked({ checked: on })
  }

  async expectCode(code: string): Promise<void> {
    await expect(this.page.getByTestId(invitePanelTestIds.code), `the lobby code is ${code}`).toHaveText(code)
  }

  async expectCodeNot(code: string): Promise<void> {
    await expect(this.page.getByTestId(invitePanelTestIds.code), `the lobby code is not ${code}`).not.toHaveText(code)
  }

  /** Step back to watch instead of play. */
  async justWatch(): Promise<void> {
    await this.page.getByTestId(roleSwitchTestIds.justWatchButton).click()
    await expect(this.page.getByTestId(roleSwitchTestIds.playInsteadButton), "the choice is now to play").toBeVisible()
  }

  /** A spectator takes a seat. */
  async playInstead(): Promise<void> {
    await this.page.getByTestId(roleSwitchTestIds.playInsteadButton).click()
    await expect(this.page.getByTestId(roleSwitchTestIds.justWatchButton), "the choice is now to watch").toBeVisible()
  }

  /** The spectators have their own heading, counting `count` of the most allowed. */
  async expectWatchingCount(count: number): Promise<void> {
    await expect(this.page.getByTestId(rosterTestIds.watchingHeading), `${count} are watching`).toContainText(
      `${count}/${MAX_SPECTATORS}`
    )
  }

  async expectNoWatchers(): Promise<void> {
    await expect(this.page.getByTestId(rosterTestIds.watchingHeading), "no one is watching").toHaveCount(0)
  }

  /** A guest leaves straight away, back home. */
  async leave(): Promise<HomePage> {
    await this.page.getByTestId(lobbyTestIds.leaveButton).click()
    return HomePage.whenShown(this.tab)
  }

  /** The host is asked first. Confirming leads home. */
  async askToLeave(): Promise<ConfirmDialog<HomePage>> {
    await this.page.getByTestId(lobbyTestIds.leaveButton).click()
    return ConfirmDialog.whenShown(this.page, () => HomePage.whenShown(this.tab))
  }

  /** Changes your own name from the player list. */
  async rename(name: string): Promise<void> {
    await this.page.getByTestId(playerListTestIds.renameButton).click()
    await this.page.getByTestId(renameFormTestIds.input).fill(name)
    await this.page.getByTestId(renameFormTestIds.saveButton).click()
    await expect(this.page.getByTestId(renameFormTestIds.input), "the rename form closes").toBeHidden()
  }

  /** Whether the host's Start button is here. */
  async expectHostControls(present = true): Promise<void> {
    await expect(
      this.page.getByTestId(setupPanelTestIds.startButton),
      present ? "the host's Start button is here" : "there is no Start button"
    ).toHaveCount(present ? 1 : 0)
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

  /** A spectator waiting for the host to start. */
  async waitForGameToStartWatching(): Promise<WatchingPage> {
    return WatchingPage.whenShown(this.tab)
  }
}
