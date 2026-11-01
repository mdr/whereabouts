import { expect, type Page } from "@playwright/test"
import type { Ms } from "@whereabouts/shared/units"
import type { Vec3 } from "../../../src/vr/probe.ts"
import { Controllers } from "./Controllers.ts"
import { installEmulator } from "./emulator.ts"
import { HeadsetPanels } from "./HeadsetPanels.ts"
import { HeadsetScene } from "./HeadsetScene.ts"
import type { Hand } from "../../../src/vr/hands/hand.ts"
import { until } from "../support.ts"
import { probe } from "./probe.ts"

/**
 * An emulated Meta Quest 3 (Meta's IWER) in place of WebXR, so a desktop
 * browser can open a VR session and the script can move the controllers
 * and press their buttons. Install before the page loads.
 */
export class Headset {
  readonly #page: Page
  readonly controllers: Controllers
  readonly scene: HeadsetScene
  readonly panels: HeadsetPanels

  static async install(page: Page): Promise<Headset> {
    await installEmulator(page)
    return new Headset(page)
  }

  constructor(page: Page) {
    this.#page = page
    this.controllers = new Controllers(page, (n) => this.frames(n))
    this.scene = new HeadsetScene(page)
    this.panels = new HeadsetPanels(page)
  }

  async inSession(): Promise<boolean> {
    return this.#page.evaluate(() => window.headset.activeSession !== undefined)
  }

  async expectInSession(timeout: Ms): Promise<void> {
    await expect.poll(() => this.inSession(), { message: "the headset session opens", timeout }).toBe(true)
  }

  /** Times the VR scene has been drawn, in the headset or not. */
  scenesDrawn() {
    return probe(this.#page, "drawn")
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
    const target = await until(
      `the ${hand} hand to point at the globe`,
      () => this.scene.target(hand),
      (at) => at !== undefined
    )
    return target!
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
    await until(
      "the headset scene to settle",
      async () => {
        const now = await look()
        const calm = !now.turning && now.layout === was.layout && now.frames - was.frames >= 5
        if (now.turning || now.layout !== was.layout) was = now
        return calm
      },
      (calm) => calm,
      30_000
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
