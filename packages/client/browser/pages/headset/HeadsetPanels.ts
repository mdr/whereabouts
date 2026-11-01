import type { Page } from "@playwright/test"
import type { Vec3 } from "../../../src/vr/probe.ts"
import type { WristButton } from "../../../src/vr/wrist/wrist-button.ts"
import { probe } from "./probe.ts"

/** What the headset's panels show, and where their buttons are: the menu, scores, board, picture and wrist. */
export class HeadsetPanels {
  readonly #page: Page

  constructor(page: Page) {
    this.#page = page
  }

  /** What the menu's Done button says: Submit, or Pass with nothing painted. */
  async doneLabel(): Promise<string> {
    return (await this.menu()).done
  }

  /** What the menu offers: Done's label, the clock, Keep editing, and the buttons after a round. */
  menu() {
    return probe(this.#page, "menuShown")
  }

  /** What the headset shows: a round to paint, its answer, or the final score. */
  view() {
    return probe(this.#page, "viewType")
  }

  /** The score table beside the globe, if it shows. */
  scoreTable() {
    return probe(this.#page, "tableShown")
  }

  /** The awards and rounds board at the end of a game, if it shows. */
  board() {
    return probe(this.#page, "boardShown")
  }

  /** The question's picture over the VR menu, width by height in metres. */
  picture() {
    return probe(this.#page, "pictureShown")
  }

  /** The place the picture's postcard back names at the reveal. */
  postcard() {
    return probe(this.#page, "picturePostcard")
  }

  /** The line of interest on the headset's reveal. */
  fact() {
    return probe(this.#page, "factShown")
  }

  /** Whether a hand holds the question's picture, where it is, and which way its face points. */
  pictureHeld() {
    return probe(this.#page, "pictureHeld")
  }

  wristOpen() {
    return probe(this.#page, "wristOpen")
  }

  /** Where a button on the wrist menu is. */
  async wristButton(id: WristButton): Promise<Vec3> {
    return this.#page.evaluate((id) => window.whereaboutsVr.probe.wristButtonAt(id), id)
  }

  /** Where a button on the VR menu is. */
  async menuButton(id: string): Promise<Vec3> {
    return this.#settled(() => this.#page.evaluate((id) => window.whereaboutsVr.probe.menuButtonAt(id), id))
  }

  /** Where a row of the score table is: Everyone, the players, then Hide paint on the reveal. */
  async scoreRow(i: number): Promise<Vec3> {
    return this.#settled(() => this.#page.evaluate((i) => window.whereaboutsVr.probe.scoreRowAt(i), i))
  }

  /**
   * Where something on a panel is, once it has stopped moving: an element
   * just shown is laid out a frame or two later, and the panels swing clear
   * of a globe zooming in. Counted in frames, not time: the emulator can
   * stall for a second or more.
   */
  async #settled(where: () => Promise<Vec3>): Promise<Vec3> {
    const at = async () => {
      const at = await where()
      const { frame, turning } = await this.#page.evaluate(() => ({
        frame: window.whereaboutsVr.frames,
        turning: window.whereaboutsVr.probe.globeTurning
      }))
      return { at, frame, turning }
    }
    let was = await at()
    for (;;) {
      await this.#page.waitForTimeout(100)
      const now = await at()
      if (now.turning) was = now
      else if (now.frame - was.frame >= 5) {
        if (Math.hypot(...now.at.map((coordinate, i) => coordinate - was.at[i]!)) < 0.001) return now.at
        was = now
      }
    }
  }
}
