import type { Page } from "playwright-core";
import type { QuestionType } from "@whereabouts/shared";
import { lobbyTestIds, setupSummaryTestIds } from "../../src/screens/LobbyTestIds.ts";
import { mixEditorTestIds } from "../../src/ui/MixEditorTestIds.ts";
import { pillsTestIds, stepperTestIds } from "../../src/ui/ControlsTestIds.ts";
import { PlayerList } from "./PlayerList.ts";
import { byTestIdWith, text, until } from "./support.ts";

export interface SetupSummary {
  rounds: string;
  seconds: string;
  questions: string;
}

/** The waiting room: the code to share, who is here, and the game setup. */
export class Lobby {
  readonly #page: Page;
  readonly players: PlayerList;

  constructor(page: Page) {
    this.#page = page;
    this.players = new PlayerList(page.getByTestId(lobbyTestIds.page));
  }

  async waitUntilShown(timeoutMs = 15_000): Promise<void> {
    await this.#page.getByTestId(lobbyTestIds.page).waitFor({ timeout: timeoutMs });
  }

  async code(): Promise<string> {
    return text(this.#page.getByTestId(lobbyTestIds.code));
  }

  /** Host: set how many rounds ask this kind of question, one step at a time. */
  async setQuestionCount(type: QuestionType, count: number): Promise<void> {
    const row = byTestIdWith(this.#page, mixEditorTestIds.row, "type", type);
    const value = row.getByTestId(stepperTestIds.value);
    for (;;) {
      const now = Number(await text(value));
      if (now === count) return;
      const up = now < count;
      await row.getByTestId(up ? stepperTestIds.moreButton : stepperTestIds.fewerButton).click();
      const next = String(up ? now + 1 : now - 1);
      await until(
        `${type} count ${next}`,
        () => text(value),
        (v) => v === next,
      );
    }
  }

  /** Host: every round asks this kind of question. */
  async setOnlyQuestions(type: QuestionType, count: number): Promise<void> {
    await this.setQuestionCount(type, count);
    for (const other of ["landmarks", "places", "countries", "flags"] as const) {
      if (other !== type) await this.setQuestionCount(other, 0);
    }
  }

  async chooseSecondsPerRound(seconds: number): Promise<void> {
    await byTestIdWith(
      this.#page.getByTestId(lobbyTestIds.secondsSetting),
      pillsTestIds.option,
      "value",
      String(seconds * 1000),
    ).click();
  }

  /** Whether this player has the host's setup controls. */
  async canChangeSetup(): Promise<boolean> {
    const controls =
      (await this.#page.getByTestId(lobbyTestIds.questionsSetting).count()) +
      (await this.#page.getByTestId(lobbyTestIds.secondsSetting).count());
    return controls > 0;
  }

  /** A guest's view of the setup the host chose. */
  async setupSummary(): Promise<SetupSummary> {
    const tile = (id: string) => this.#page.getByTestId(id);
    return {
      rounds: await text(tile(setupSummaryTestIds.rounds).getByTestId(setupSummaryTestIds.tileValue)),
      seconds: await text(tile(setupSummaryTestIds.seconds).getByTestId(setupSummaryTestIds.tileValue)),
      questions: await text(tile(setupSummaryTestIds.questions)),
    };
  }

  async waitForSetupSummary(expected: SetupSummary): Promise<void> {
    await until(
      `setup summary ${JSON.stringify(expected)}`,
      () => this.setupSummary(),
      (s) => s.rounds === expected.rounds && s.seconds === expected.seconds && s.questions === expected.questions,
    );
  }

  async startGame(): Promise<void> {
    await this.#page.getByTestId(lobbyTestIds.startButton).click();
  }
}
