import { createRequire } from "node:module"
import type { WristButton } from "../../src/vr/wrist.ts"
import type { Page } from "playwright-core"
import type {} from "../../src/vr/index.ts"

type Vec = [number, number, number]
type Hand = "left" | "right"

declare global {
  interface Window {
    /** iwer's browser build. */
    IWER: {
      XRDevice: new (config: unknown, options: { stereoEnabled: boolean }) => EmulatedHeadset
      metaQuest3: unknown
    }
    headset: EmulatedHeadset
  }
}

interface EmulatedHeadset {
  position: { x: number; y: number; z: number }
  controllers: Partial<Record<"left" | "right", EmulatedController>>
  activeSession: unknown
  installRuntime(options: { forceInstall: boolean }): void
}

interface EmulatedController {
  position: { x: number; y: number; z: number }
  quaternion: { set(x: number, y: number, z: number, w: number): void }
  updateButtonValue(id: string, value: number): void
  updateAxes(id: string, x: number, y: number): void
}

/**
 * An emulated Meta Quest 3 (Meta's IWER) in place of WebXR, so a desktop
 * browser can open a VR session and the script can move the controllers
 * and press their buttons. Install before the page loads.
 */
export class Headset {
  readonly #page: Page

  static async install(page: Page): Promise<Headset> {
    const iwer = createRequire(import.meta.url).resolve("iwer/build/iwer.min.js")
    await page.context().addInitScript({ path: iwer })
    await page.context().addInitScript(() => {
      const { XRDevice, metaQuest3 } = window.IWER
      const device = new XRDevice(metaQuest3, { stereoEnabled: false })
      // Desktop Chrome has a WebXR of its own, with no headset.
      device.installRuntime({ forceInstall: true })
      window.headset = device

      // A standalone headset such as the Quest runs none of the page's
      // animation frames while a session shows (the WebXR spec allows it);
      // hold them until it ends. The emulator's own frame loop must still run.
      const run = window.requestAnimationFrame.bind(window)
      const cancel = window.cancelAnimationFrame.bind(window)
      const held = new Map<number, FrameRequestCallback>()
      let nextHeld = -1
      window.requestAnimationFrame = (callback) => {
        if (device.activeSession === undefined || callback.name === "onDeviceFrame") return run(callback)
        held.set(nextHeld, callback)
        return nextHeld--
      }
      window.cancelAnimationFrame = (handle) => (handle < 0 ? void held.delete(handle) : cancel(handle))
      setInterval(() => {
        if (device.activeSession !== undefined) return
        for (const callback of held.values()) run(callback)
        held.clear()
      }, 50)
    })
    return new Headset(page)
  }

  constructor(page: Page) {
    this.#page = page
  }

  async inSession(): Promise<boolean> {
    return this.#page.evaluate(() => window.headset.activeSession !== undefined)
  }

  /** Cells of paint drawn on the VR globe. */
  async globePaintCells(): Promise<number> {
    return this.#page.evaluate(() => window.whereaboutsVr.shownPaintCells)
  }

  /** Whether the page's map shows over the zoomed-in globe. */
  async globeDetailShown(): Promise<boolean> {
    return this.#page.evaluate(() => window.whereaboutsVr.detailShown)
  }

  /** Whether the globe's land shows in natural colour. */
  async globeColourShown(): Promise<boolean> {
    return this.#page.evaluate(() => window.whereaboutsVr.colourShown)
  }

  /** The question's picture over the VR menu, width by height in metres. */
  async picture(): Promise<[number, number] | undefined> {
    return this.#page.evaluate(() => window.whereaboutsVr.pictureShown)
  }

  /** What the headset shows: a round to paint, its answer, or the final score. */
  async view(): Promise<string | undefined> {
    return this.#page.evaluate(() => window.whereaboutsVr.viewKind)
  }

  /** Whether a hand holds the question's picture, and where the picture is. */
  async pictureHeld(): Promise<{ held: boolean; at: Vec }> {
    return this.#page.evaluate(() => window.whereaboutsVr.pictureHeld)
  }

  async eyes(): Promise<Vec> {
    return this.#page.evaluate(() => {
      const p = window.headset.position
      return [p.x, p.y, p.z] as [number, number, number]
    })
  }

  /** Hold the right controller at `from`, its ray pointing at `at`. */
  async pointRight(from: Vec, at: Vec): Promise<void> {
    await this.point("right", from, at)
  }

  async point(hand: Hand, from: Vec, at: Vec): Promise<void> {
    await this.#page.evaluate(
      ([hand, from, at]) => {
        const c = window.headset.controllers[hand]!
        c.position.x = from[0]
        c.position.y = from[1]
        c.position.z = from[2]
        // The rotation taking the ray's rest direction, -Z, onto the direction to `at`.
        const d = [at[0] - from[0], at[1] - from[1], at[2] - from[2]]
        const n = Math.hypot(d[0]!, d[1]!, d[2]!)
        const [x, y, z] = d.map((v) => v / n) as [number, number, number]
        // cross((0,0,-1), d) and 1 + dot((0,0,-1), d), normalised.
        const q = [y, -x, 0, 1 - z]
        const m = Math.hypot(...q)
        c.quaternion.set(q[0]! / m, q[1]! / m, q[2]! / m, q[3]! / m)
      },
      [hand, from, at] as const
    )
  }

  async rightGrip(value: number): Promise<void> {
    await this.#page.evaluate((v) => window.headset.controllers.right!.updateButtonValue("squeeze", v), value)
  }

  async trigger(hand: Hand, value: number): Promise<void> {
    await this.#page.evaluate(([h, v]) => window.headset.controllers[h]!.updateButtonValue("trigger", v), [
      hand,
      value
    ] as const)
  }

  /** Push the right thumbstick: up is y -1. */
  async rightStick(x: number, y: number): Promise<void> {
    await this.#page.evaluate(([x, y]) => window.headset.controllers.right!.updateAxes("thumbstick", x, y), [
      x,
      y
    ] as const)
  }

  async rightTrigger(value: number): Promise<void> {
    await this.trigger("right", value)
  }

  /** Hold a controller at `at`, turned by the quaternion `rotation` from its rest pose. */
  async hold(hand: Hand, at: Vec, rotation: [number, number, number, number]): Promise<void> {
    await this.#page.evaluate(
      ([hand, at, r]) => {
        const c = window.headset.controllers[hand]!
        c.position.x = at[0]
        c.position.y = at[1]
        c.position.z = at[2]
        c.quaternion.set(r[0], r[1], r[2], r[3])
      },
      [hand, at, rotation] as const
    )
  }

  async wristOpen(): Promise<boolean> {
    return this.#page.evaluate(() => window.whereaboutsVr.wristOpen)
  }

  /** Where a button on the wrist menu is. */
  async wristButton(id: WristButton): Promise<Vec> {
    return this.#page.evaluate((id) => window.whereaboutsVr.wristButtonAt(id), id)
  }

  /** Whether the globe shades a hint's band. */
  async hintShown(): Promise<boolean> {
    return this.#page.evaluate(() => window.whereaboutsVr.hintShown)
  }

  /** Where a hand's tool would land on the globe, if it points at it. */
  async target(hand: Hand): Promise<Vec | undefined> {
    return this.#page.evaluate((h) => window.whereaboutsVr.targetOf(h), hand)
  }

  /** Where a button on the VR menu is. */
  async menuButton(id: string): Promise<Vec> {
    return this.#page.evaluate((id) => window.whereaboutsVr.menuButtonAt(id), id)
  }
}
