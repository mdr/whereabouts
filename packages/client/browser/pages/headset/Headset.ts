import type { Page } from "@playwright/test"
import type { Vec3 } from "../../../src/vr/probe.ts"
import { Controllers } from "./Controllers.ts"
import { installEmulator } from "./emulator.ts"
import { HeadsetPanels } from "./HeadsetPanels.ts"
import { HeadsetScene } from "./HeadsetScene.ts"
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

  /**
   * Wait for `n` frames to be drawn: the emulator can stall for a second or more, so time is no measure.
   * Polled on a timer: in a headset session the page's own animation frames, Playwright's default, can stop.
   */
  async frames(n: number): Promise<void> {
    const start = await this.#page.evaluate(() => window.whereaboutsVr.frames)
    await this.#page
      .waitForFunction((end) => window.whereaboutsVr.frames >= end, start + n, { polling: 50 })
      .catch(async (err: unknown) => {
        const state = await this.#page.evaluate(() => ({
          frames: window.whereaboutsVr.frames,
          active: window.whereaboutsVr.active.value,
          view: window.whereaboutsVr.probe.viewType,
          visibility: document.visibilityState
        }))
        throw new Error(`No frames drawn: ${JSON.stringify({ start, ...state })}`, { cause: err })
      })
  }
}
