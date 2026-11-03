import { PageObject } from "../steps.ts"
import { expect, type Page } from "@playwright/test"
import type { Ms } from "@whereabouts/shared/units"
import type { Vec3 } from "../../../src/vr/probe.ts"
import { Controllers } from "./Controllers.ts"
import { installEmulator } from "./emulator.ts"
import { HeadsetPanels } from "./HeadsetPanels.ts"
import { HeadsetScene } from "./HeadsetScene.ts"
import type { Hand } from "../../../src/vr/hands/hand.ts"
import { holdUntil, expectPolled, stillTrueFor } from "../support.ts"
import { vrButtonTestIds } from "../../../src/ui/VrButton/VrButtonTestIds.ts"
import { probe } from "./probe.ts"

/**
 * An emulated Meta Quest 3 (Meta's IWER) in place of WebXR, so a desktop
 * browser can open a VR session and the script can move the controllers
 * and press their buttons. Install before the page loads.
 */
export class Headset extends PageObject {
  readonly #page: Page
  readonly controllers: Controllers
  readonly scene: HeadsetScene
  readonly panels: HeadsetPanels

  static async install(page: Page): Promise<Headset> {
    await installEmulator(page)
    return new Headset(page)
  }

  constructor(page: Page) {
    super()
    this.#page = page
    this.controllers = new Controllers(page, (n) => this.frames(n))
    this.scene = new HeadsetScene(page)
    this.panels = new HeadsetPanels(page)
  }

  /** Press the page's VR button. */
  async pressVrButton(): Promise<void> {
    await this.#vr(vrButtonTestIds.button).click()
  }

  async expectVrButtonOffered(): Promise<void> {
    await expect(this.#vr(vrButtonTestIds.button), "a headset browser offers VR").toBeVisible()
  }

  async expectVrButtonInVr(): Promise<void> {
    await expect(this.#vr(vrButtonTestIds.inVr), "the VR button opens a headset session").toBeVisible()
  }

  async expectLoadingShown(): Promise<void> {
    await expect(this.#vr(vrButtonTestIds.loading), "loading VR covers the screen").toBeVisible()
  }

  /** VR has loaded, but waits for another press to enter. */
  async expectEnterButtonOffered(timeout: Ms): Promise<void> {
    await expect(this.#vr(vrButtonTestIds.enterButton), "VR waits to be asked again").toBeVisible({ timeout })
  }

  async pressEnterButton(): Promise<void> {
    await this.#vr(vrButtonTestIds.enterButton).click()
  }

  #vr(testId: string) {
    return this.#page.getByTestId(testId)
  }

  /** Leave VR from the page, as the Leave VR button does. */
  async leave(): Promise<void> {
    await this.#page.evaluate(() => window.testHooks.vr!.exit())
  }

  async expectInSession(timeout: Ms = 10_000): Promise<void> {
    await expect
      .poll(() => this.#page.evaluate(() => window.headset.activeSession !== undefined), {
        message: "the headset session opens",
        timeout
      })
      .toBe(true)
  }

  async expectOutOfSession(timeout: Ms = 10_000): Promise<void> {
    await expect
      .poll(() => this.#page.evaluate(() => window.headset.activeSession === undefined), {
        message: "Leave VR leaves it",
        timeout
      })
      .toBe(true)
  }

  /** The headset stays out of a session for `duration`. */
  async expectStaysOutOfSession(duration: Ms = 500): Promise<void> {
    await stillTrueFor(
      "the headset staying out of a session",
      duration,
      () => this.#page.evaluate(() => window.headset.activeSession === undefined),
      (out) => out
    )
  }

  /** The VR scene is not drawn on the page for `duration`. */
  async expectSceneStaysUndrawn(duration: Ms = 500): Promise<void> {
    const drawn = () => probe(this.#page, "drawn")
    const was = await drawn()
    await stillTrueFor("the VR scene staying undrawn", duration, drawn, (now) => now === was)
  }

  /** The headset has zoomed the globe in until the page's map shows over it. */
  async zoomInUntilMapShows(): Promise<void> {
    await this.#holdStick(-1, () => this.scene.expectGlobeDetail(true, { timeout: 30_000 }))
  }

  /** The globe has zoomed right out, to its smallest size. */
  async zoomOutUntilWhole(): Promise<void> {
    await this.#holdStick(1, () => this.scene.expectGlobeScale({ exactly: 1 }, { timeout: 30_000 }))
  }

  /** The globe has zoomed in until it is `scale` times its smallest size. */
  async zoomInUntilScale(scale: number): Promise<void> {
    await this.#holdStick(-1, () => this.scene.expectGlobeScale({ atLeast: scale }, { timeout: 60_000 }))
  }

  async #holdStick(y: number, expectation: () => Promise<void>): Promise<void> {
    await holdUntil(
      () => this.controllers.rightStick(0, y),
      expectation,
      () => this.controllers.rightStick(0, 0)
    )
  }

  async eyes(): Promise<Vec3> {
    return this.#page.evaluate(() => {
      const p = window.headset.position
      return [p.x, p.y, p.z] as Vec3
    })
  }

  /** Where a hand's tool lands on the globe, once the frames drawn since it was aimed have caught up with the aim. */
  async aimedAt(hand: Hand): Promise<Vec3> {
    await this.frames(3)
    const found: { at: Vec3 | undefined } = { at: undefined }
    await expectPolled(
      `the ${hand} hand points at the globe`,
      "a point on the globe",
      async () => {
        found.at = await this.scene.target(hand)
        return found.at
      },
      (at) => at !== undefined,
      { timeout: 10_000 }
    )
    if (!found.at) throw new Error(`The ${hand} hand pointed at the globe without a target`)
    return found.at
  }

  /**
   * Until the scene has stopped changing: the globe still and its size,
   * panels and paint the same over five frames. For a screenshot that does
   * not depend on timing.
   */
  async settle(): Promise<void> {
    const look = () =>
      this.#page.evaluate(() => {
        const { frames, probe } = window.testHooks.vr!
        // Millimetres: a smoothed move never quite stops.
        const layout = JSON.stringify(
          [
            probe.globeScale,
            probe.panelGap,
            probe.menuShown,
            probe.tableShown,
            probe.shownPaintCells,
            probe.viewType,
            probe.pictureHeld
          ],
          (_key, value: unknown) => (typeof value === "number" ? Math.round(value * 1000) : value)
        )
        return { frames, layout, turning: probe.globeTurning }
      })
    let was = await look()
    await expectPolled(
      "the headset scene settles",
      "calm",
      async () => {
        const now = await look()
        const calm = !now.turning && now.layout === was.layout && now.frames - was.frames >= 5
        if (now.turning || now.layout !== was.layout) was = now
        return { calm, turning: now.turning, layout: now.layout }
      },
      ({ calm }) => calm,
      { timeout: 30_000 }
    )
  }

  /**
   * Wait for `n` frames to be drawn: the emulator can stall for a second or more, so time is no measure.
   * Polled on a timer: in a headset session the page's own animation frames, Playwright's default, can stop.
   */
  async frames(n: number): Promise<void> {
    const start = await this.#page.evaluate(() => window.testHooks.vr!.frames)
    await this.#page
      .waitForFunction((end) => window.testHooks.vr!.frames >= end, start + n, { polling: 50 })
      .catch(async (err: unknown) => {
        const state = await this.#page.evaluate(() => ({
          frames: window.testHooks.vr!.frames,
          active: window.testHooks.vr!.active.value,
          view: window.testHooks.vr!.probe.viewType,
          visibility: document.visibilityState
        }))
        throw new Error(`No frames drawn: ${JSON.stringify({ start, ...state })}`, { cause: err })
      })
  }
}
