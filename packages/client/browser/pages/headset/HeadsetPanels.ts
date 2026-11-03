import { PageObject } from "../steps.ts"
import type { Page } from "@playwright/test"
import type { MenuShown } from "../../../src/vr/menu/menu.ts"
import type { PictureBack } from "../../../src/vr/picture/picture-back.ts"
import type { Vec3 } from "../../../src/vr/probe.ts"
import type { VrViewType } from "../../../src/vr/view/view.ts"
import { flagImageTestIds } from "../../../src/ui/round/question/FlagImage/FlagImageTestIds.ts"
import type { WristButton } from "../../../src/vr/wrist/wrist-button.ts"
import { expectNumber, expectPolled, stillTrueFor, type Bounds, type PollOptions } from "../support.ts"
import { expectProbe, probe } from "./probe.ts"
import type { Ms } from "@whereabouts/shared/units"

/** What to expect of the score table: each part given must match exactly, except `namesInclude`. */
export interface ScoreTableExpectation {
  title?: string
  rowCount?: number
  names?: string[]
  namesInclude?: string[]
  details?: string[]
  totals?: string[]
}

const labels = (actions: { label: string }[]): string[] => actions.map((action) => action.label)

/** The angle between two directions, in radians. */
const angleBetween = (a: number[], b: number[]): number =>
  Math.acos(a.reduce((sum, component, i) => sum + component * b[i]!, 0) / Math.hypot(...a) / Math.hypot(...b))

/** What the headset's panels show, and where their buttons are: the menu, scores, board, picture and wrist. */
export class HeadsetPanels extends PageObject {
  readonly #page: Page

  constructor(page: Page) {
    super()
    this.#page = page
  }

  async #expectMenu(
    message: string,
    wanted: string,
    ok: (menu: MenuShown) => boolean,
    options: PollOptions = {}
  ): Promise<void> {
    await expectProbe(this.#page, "menuShown", message, wanted, ok, options)
  }

  /** What the menu's Done button says: Done, or Pass with nothing painted. */
  async expectDoneLabel(label: "Done" | "Pass", options: PollOptions = {}): Promise<void> {
    await this.#expectMenu(
      label === "Pass" ? "with nothing painted, the menu offers Pass" : `with paint down, the menu offers ${label}`,
      label,
      (menu) => menu.done === label,
      options
    )
  }

  /** The menu counts down the round: "1:00 left". */
  async expectClock(options: PollOptions = {}): Promise<void> {
    await this.#expectMenu(
      "the menu counts down the round",
      "m:ss left",
      (menu) => /^\d:\d\d left$/.test(menu.clock),
      options
    )
  }

  /** The menu heads the question or round. */
  async expectHeading(heading: string | RegExp, options: PollOptions = {}): Promise<void> {
    await this.#expectMenu(
      "the menu heads the question",
      String(heading),
      (menu) => (typeof heading === "string" ? menu.heading === heading : heading.test(menu.heading)),
      options
    )
  }

  /** The guess is locked in and the menu offers Keep editing, or it does not. */
  async expectKeepEditing(offered: boolean, options: PollOptions = {}): Promise<void> {
    await this.#expectMenu(
      offered ? "the guess is locked in, and the menu offers Keep editing" : "the guess is unlocked",
      String(offered),
      (menu) => menu.unlock === offered,
      options
    )
  }

  /** The menu's main buttons, by label. */
  async expectActions(wanted: string[], options: PollOptions = {}): Promise<void> {
    await this.#expectMenu(
      "the menu offers its buttons",
      wanted.join(", "),
      (menu) => labels(menu.actions).join() === wanted.join(),
      options
    )
  }

  async expectActionOffered(label: string, options: PollOptions = {}): Promise<void> {
    await this.#expectMenu(`the menu offers ${label}`, label, (menu) => labels(menu.actions).includes(label), options)
  }

  /** The first of the menu's buttons says `label` and is on or off. */
  async expectFirstAction(label: string, enabled: boolean, options: PollOptions = {}): Promise<void> {
    await this.#expectMenu(
      `the menu's first button says ${label}`,
      `${label}, ${enabled ? "enabled" : "disabled"}`,
      (menu) => menu.actions[0]?.label === label && menu.actions[0].enabled === enabled,
      options
    )
  }

  /** The menu's host controls under "more", by label. */
  async expectMoreActions(wanted: string[], options: PollOptions = {}): Promise<void> {
    await this.#expectMenu(
      "the menu offers the host's controls",
      wanted.join(", "),
      (menu) => labels(menu.more).join() === wanted.join(),
      options
    )
  }

  async expectFirstMoreAction(label: string, options: PollOptions = {}): Promise<void> {
    await this.#expectMenu(
      `the host's first control says ${label}`,
      label,
      (menu) => menu.more[0]?.label === label,
      options
    )
  }

  /** The menu says how to answer the question. */
  async expectMode(mode: RegExp, options: PollOptions = {}): Promise<void> {
    await this.#expectMenu(
      "the menu says how to answer the question",
      String(mode),
      (menu) => mode.test(menu.mode ?? ""),
      options
    )
  }

  /** What the headset shows: a round to paint, its answer, or the final score. */
  async expectView(view: VrViewType, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "viewType",
      `the headset shows the ${view} view`,
      view,
      (shown) => shown === view,
      options
    )
  }

  /** The score table beside the globe. */
  async expectScoreTable(wanted: ScoreTableExpectation, options: PollOptions = {}): Promise<void> {
    const { title, rowCount, names, namesInclude, details, totals } = wanted
    await expectProbe(
      this.#page,
      "tableShown",
      "the score table beside the globe",
      JSON.stringify(wanted),
      (table) => {
        if (table === undefined) return false
        const rowNames = table.rows.map((row) => row.name)
        return (
          (title === undefined || table.title === title) &&
          (rowCount === undefined || table.rows.length === rowCount) &&
          (names === undefined || rowNames.join() === names.join()) &&
          (namesInclude === undefined || namesInclude.every((name) => rowNames.includes(name))) &&
          (details === undefined || table.rows.map((row) => row.detail).join() === details.join()) &&
          (totals === undefined || table.rows.map((row) => row.total).join() === totals.join())
        )
      },
      options
    )
  }

  /** The table's row for `name` is the one picked. */
  async expectRowSelected(name: string, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "tableShown",
      `pointing at the ${name} row picks it`,
      name,
      (table) => table?.rows.find((row) => row.name === name)?.selected === true,
      options
    )
  }

  /** The board of awards and every round, at the end of a game. */
  async expectBoardRounds(rounds: number, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "boardShown",
      "a board shows the awards and every round",
      `${rounds} rounds`,
      (board) => board?.rounds.length === rounds,
      options
    )
  }

  /** The question's picture shows over the VR menu. */
  async expectPictureShown(options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "pictureShown",
      "the question's picture shows in VR",
      "a picture",
      (size) => size !== undefined,
      options
    )
  }

  /** The picture shows the flag in its own shape, as the page's flag does. */
  async expectPictureInFlagShape(options: PollOptions = {}): Promise<void> {
    await expectPolled(
      "a flag round shows the flag in VR in its own shape",
      "the picture's ratio matching the flag's",
      async () => {
        const size = await probe(this.#page, "pictureShown")
        const ratio = Number(
          await this.#page
            .getByTestId(flagImageTestIds.flag)
            .evaluate((element) => (element as HTMLElement).style.getPropertyValue("--flag-ratio"))
        )
        return { size, ratio }
      },
      ({ size, ratio }) => size !== undefined && Math.abs(size[0] / size[1] / ratio - 1) < 0.01,
      { timeout: 10_000, ...options }
    )
  }

  /** The place the picture's postcard back names at the reveal. */
  async expectPostcardShown(options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "picturePostcard",
      "the answer's photo shows its postcard back",
      "a place",
      (place) => place !== undefined,
      options
    )
  }

  /** The line of interest on the headset's reveal. */
  async expectFact(options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "factShown",
      "there is a line about the answer",
      "over 20 characters",
      (fact) => (fact ?? "").length > 20,
      options
    )
  }

  /** Whether a hand holds the question's picture, where it is, and which way its face points. */
  pictureHeld(): Promise<{ held: boolean; at: Vec3; facing: Vec3; back: PictureBack | undefined }> {
    return probe(this.#page, "pictureHeld")
  }

  async expectPictureHeld(held: boolean, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "pictureHeld",
      held ? "gripping the flag takes it in hand" : "letting go lets the flag go",
      String(held),
      (picture) => picture.held === held,
      options
    )
  }

  /** The picture is `bounds` metres from `origin`. */
  async expectPictureDistanceFrom(origin: Vec3, bounds: Bounds, options: PollOptions = {}): Promise<void> {
    await expectNumber(
      "metres the picture is from where it started",
      async () => Math.hypot(...(await this.pictureHeld()).at.map((component, i) => component - origin[i]!)),
      bounds,
      { timeout: 10_000, ...options }
    )
  }

  /** The picture faces within `tolerance` radians of `facing`. */
  async expectPictureFacing(facing: Vec3, tolerance: number, options: PollOptions = {}): Promise<void> {
    await expectNumber(
      "radians the picture is off the hand's turn",
      async () => angleBetween((await this.pictureHeld()).facing, facing),
      { lessThan: tolerance },
      { timeout: 10_000, ...options }
    )
  }

  /** The picture is turned `bounds` radians from `facing`. */
  async expectPictureTurnedFrom(facing: Vec3, bounds: Bounds, options: PollOptions = {}): Promise<void> {
    await expectNumber(
      "radians the picture is turned from where it faced",
      async () => angleBetween(facing, (await this.pictureHeld()).facing),
      bounds,
      { timeout: 10_000, ...options }
    )
  }

  async expectPictureBack(back: PictureBack, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "pictureHeld",
      "turned round, the picture shows its back",
      back,
      (picture) => picture.back === back,
      options
    )
  }

  async expectWristOpen(open: boolean, options: PollOptions = {}): Promise<void> {
    await expectProbe(
      this.#page,
      "wristOpen",
      open ? "turning the left palm up opens the wrist menu" : "turning the palm away shuts the wrist menu",
      String(open),
      (now) => now === open,
      options
    )
  }

  /** The wrist menu stays shut for `duration`. */
  async expectWristStaysShut(duration: Ms = 500): Promise<void> {
    await stillTrueFor(
      "the wrist menu staying shut",
      duration,
      () => probe(this.#page, "wristOpen"),
      (open) => !open
    )
  }

  /** Where a button on the wrist menu is. */
  async wristButton(id: WristButton): Promise<Vec3> {
    return this.#page.evaluate((id) => window.testHooks.vr!.probe.wristButtonAt(id), id)
  }

  /** Where a button on the VR menu is. */
  async menuButton(id: string): Promise<Vec3> {
    return this.#settled(() => this.#page.evaluate((id) => window.testHooks.vr!.probe.menuButtonAt(id), id))
  }

  /** Where the score table's row for `name` is: a player, Everyone, or Hide paint on the reveal. */
  async scoreRow(name: string): Promise<Vec3> {
    const table = await probe(this.#page, "tableShown")
    const i = table?.rows.findIndex((row) => row.name === name) ?? -1
    if (i < 0) throw new Error(`No score row for ${name}: ${JSON.stringify(table?.rows.map((row) => row.name))}`)
    return this.#settled(() => this.#page.evaluate((i) => window.testHooks.vr!.probe.scoreRowAt(i), i))
  }

  /**
   * Where something on a panel is, once it has stopped moving: an element
   * just shown is laid out a frame or two later, and the panels swing clear
   * of a globe zooming in. Counted in frames, not time: the emulator can
   * stall for a second or more.
   */
  async #settled(where: () => Promise<Vec3>): Promise<Vec3> {
    const sample = async (): Promise<{ at: Vec3; frame: number; turning: boolean }> => {
      const at = await where()
      const { frame, turning } = await this.#page.evaluate(() => ({
        frame: window.testHooks.vr!.frames,
        turning: window.testHooks.vr!.probe.globeTurning
      }))
      return { at, frame, turning }
    }
    let was = await sample()
    const settled: { at: Vec3 | undefined } = { at: undefined }
    await expectPolled(
      "the panel's button stops moving",
      "still",
      async () => {
        const now = await sample()
        if (now.turning) {
          was = now
          return { still: false, ...now }
        }
        if (now.frame - was.frame < 5) return { still: false, ...now }
        const moved = Math.hypot(...now.at.map((coordinate, i) => coordinate - was.at[i]!))
        was = now
        if (moved < 0.001) settled.at = now.at
        return { still: moved < 0.001, ...now }
      },
      ({ still }) => still,
      { timeout: 60_000 }
    )
    if (!settled.at) throw new Error("The panel settled without a position")
    return settled.at
  }
}
