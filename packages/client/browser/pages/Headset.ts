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

  /** Whether national borders show on the globe. */
  async globeBordersShown(): Promise<boolean> {
    return this.#page.evaluate(() => window.whereaboutsVr.bordersShown)
  }

  /** What the menu's Done button says: Submit, or Pass with nothing painted. */
  async doneLabel(): Promise<string> {
    return (await this.menu()).done
  }

  /** What the menu offers: Done's label, the clock, Keep editing, and the buttons after a round. */
  async menu(): Promise<{
    done: string
    clock: string
    unlock: boolean
    actions: { label: string; enabled: boolean }[]
    more: { label: string; enabled: boolean }[]
    heading: string
    mode: string | undefined
    why: string | undefined
    note: string | undefined
  }> {
    return this.#page.evaluate(() => window.whereaboutsVr.menuShown)
  }

  /** Droplets and crumbs in the air. */
  async particles(): Promise<number> {
    return this.#page.evaluate(() => window.whereaboutsVr.particlesLive)
  }

  /** The narrowest gap, in radians as the player sees it, between a panel and the globe: negative if one overlaps it. */
  async panelGap(): Promise<number> {
    return this.#page.evaluate(() => window.whereaboutsVr.panelGap)
  }

  /** How many countries' flags are pinned on the globe. */
  async flagPins(): Promise<number> {
    return this.#page.evaluate(() => window.whereaboutsVr.flagPinsShown)
  }

  /** The country whose flag the player points at, if any. */
  async flagNamed(): Promise<string | undefined> {
    return this.#page.evaluate(() => window.whereaboutsVr.flagNamed)
  }

  /** The country whose border is picked out on the globe, and in how many line segments. */
  async flagOutlined(): Promise<{ name: string; segments: number } | undefined> {
    return this.#page.evaluate(() => window.whereaboutsVr.flagOutlined)
  }

  /** The flag nearest the eyes, and where its middle is. */
  async flagFacing(): Promise<{ name: string; at: Vec } | undefined> {
    return this.#page.evaluate(() => window.whereaboutsVr.flagFacing)
  }

  /** How much paint the round has: every cell's intensity, summed. */
  async paintMass(): Promise<number> {
    return this.#page.evaluate(() => window.whereaboutsVr.paintMass)
  }

  /** Whether the controllers themselves show, rather than the can and eraser. */
  async controllersShown(): Promise<boolean> {
    return this.#page.evaluate(() => window.whereaboutsVr.controllersShown)
  }

  /** Whether a pointing ray shows from either hand. */
  async beamsShown(): Promise<boolean> {
    return this.#page.evaluate(() => window.whereaboutsVr.beamsShown)
  }

  /** The moon's distance from the globe and its radius, in globe radii, if it shows. */
  async moon(): Promise<{ distance: number; radius: number } | undefined> {
    return this.#page.evaluate(() => window.whereaboutsVr.moonShown)
  }

  /** How many times its smallest size the globe is. */
  async globeScale(): Promise<number> {
    return this.#page.evaluate(() => window.whereaboutsVr.globeScale)
  }

  /** Whether either hand holds its can or eraser. */
  async toolsHeld(): Promise<boolean> {
    return this.#page.evaluate(() => window.whereaboutsVr.toolsHeld)
  }

  /** Whether space shows round the player, and whether the room should instead. */
  async surroundings(): Promise<{ space: boolean; passthrough: boolean }> {
    return this.#page.evaluate(() => ({
      space: window.whereaboutsVr.spaceShown,
      passthrough: window.whereaboutsVr.passthrough
    }))
  }

  /** The awards and rounds board at the end of a game, if it shows. */
  async board(): Promise<{ awards: { title: string }[]; rounds: { label: string }[] } | undefined> {
    return this.#page.evaluate(() => window.whereaboutsVr.boardShown)
  }

  /** The score table beside the globe, if it shows. */
  async scoreTable(): Promise<
    { title: string; rows: { name: string; detail?: string; total: string; selected?: boolean }[] } | undefined
  > {
    return this.#page.evaluate(() => window.whereaboutsVr.tableShown)
  }

  /** The question's picture over the VR menu, width by height in metres. */
  async picture(): Promise<[number, number] | undefined> {
    return this.#page.evaluate(() => window.whereaboutsVr.pictureShown)
  }

  /** The line of interest on the headset's reveal. */
  async fact(): Promise<string | undefined> {
    return this.#page.evaluate(() => window.whereaboutsVr.factShown)
  }

  /** What the headset shows: a round to paint, its answer, or the final score. */
  async view(): Promise<string | undefined> {
    return this.#page.evaluate(() => window.whereaboutsVr.viewKind)
  }

  /** Whether a hand holds the question's picture, where it is, and which way its face points. */
  async pictureHeld(): Promise<{ held: boolean; at: Vec; facing: Vec; back: "reverse" | "postcard" | undefined }> {
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
    await this.grip("right", value)
  }

  async grip(hand: Hand, value: number): Promise<void> {
    await this.#page.evaluate(([h, v]) => window.headset.controllers[h]!.updateButtonValue("squeeze", v), [
      hand,
      value
    ] as const)
  }

  async trigger(hand: Hand, value: number): Promise<void> {
    await this.#page.evaluate(([h, v]) => window.headset.controllers[h]!.updateButtonValue("trigger", v), [
      hand,
      value
    ] as const)
  }

  /**
   * Point the right hand from `from` at `at` and click the trigger. Timed
   * in frames: a press only clicks if the frame seeing it released comes
   * within 300 ms of the frame seeing it pressed (pointer-events'
   * clickThresholdMs), and the emulator can stall for longer than that.
   */
  async press(from: Vec, at: Vec): Promise<void> {
    await this.pointRight(from, at)
    await this.frames(3)
    // A stall while it is held can still outlast that: then press again.
    for (let tries = 1; ; tries++) {
      const clicks = await this.#page.evaluate(() => window.whereaboutsVr.clicks)
      await this.trigger("right", 1)
      await this.frames(2)
      await this.trigger("right", 0)
      await this.frames(3)
      if ((await this.#page.evaluate(() => window.whereaboutsVr.clicks)) > clicks) return
      if (tries === 3) throw new Error("Three presses and no click")
      console.warn("  (no click: pressing again)")
    }
  }

  /** Wait for `n` frames to be drawn: the emulator can stall for a second or more, so time is no measure. */
  async frames(n: number): Promise<void> {
    const start = await this.#page.evaluate(() => window.whereaboutsVr.frames)
    await this.#page.waitForFunction((end) => window.whereaboutsVr.frames >= end, start + n)
  }

  /** Push the right thumbstick: up is y -1. */
  async rightStick(x: number, y: number): Promise<void> {
    await this.#page.evaluate(([x, y]) => window.headset.controllers.right!.updateAxes("thumbstick", x, y), [
      x,
      y
    ] as const)
  }

  /** Press and let go a controller's face button: "a-button" or "x-button" steps through its hand's tools. */
  async button(hand: Hand, id: "a-button" | "x-button"): Promise<void> {
    await this.#page.evaluate(([h, id]) => window.headset.controllers[h]!.updateButtonValue(id, 1), [hand, id] as const)
    await this.frames(3)
    await this.#page.evaluate(([h, id]) => window.headset.controllers[h]!.updateButtonValue(id, 0), [hand, id] as const)
    await this.frames(3)
  }

  /** What each hand holds: paint, erase or fill. */
  async toolInHand(): Promise<Record<Hand, string>> {
    return this.#page.evaluate(() => window.whereaboutsVr.toolInHand)
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
    return this.#settled(() => this.#page.evaluate((id) => window.whereaboutsVr.menuButtonAt(id), id))
  }

  /** Where a row of the score table is: Everyone, the players, then Hide paint on the reveal. */
  async scoreRow(i: number): Promise<Vec> {
    return this.#settled(() => this.#page.evaluate((i) => window.whereaboutsVr.scoreRowAt(i), i))
  }

  /**
   * Where something on a panel is, once it has stopped moving: an element
   * just shown is laid out a frame or two later, and the panels swing clear
   * of a globe zooming in. Counted in frames, not time: the emulator can
   * stall for a second or more.
   */
  async #settled(where: () => Promise<Vec>): Promise<Vec> {
    const at = async () => {
      const at = await where()
      const { frame, turning } = await this.#page.evaluate(() => ({
        frame: window.whereaboutsVr.frames,
        turning: window.whereaboutsVr.globeTurning
      }))
      return { at, frame, turning }
    }
    let was = await at()
    for (;;) {
      await this.#page.waitForTimeout(100)
      const now = await at()
      if (now.turning) was = now
      else if (now.frame - was.frame >= 5) {
        if (Math.hypot(...now.at.map((c, i) => c - was.at[i]!)) < 0.001) return now.at
        was = now
      }
    }
  }
}
