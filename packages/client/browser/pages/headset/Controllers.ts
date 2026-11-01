import type { Page } from "@playwright/test"
import { Hand, XR_HAND } from "../../../src/vr/hands/hand.ts"
import type { Quaternion, Vec3 } from "../../../src/vr/probe.ts"

/** The emulated controllers: where they are and what they press. */
export class Controllers {
  readonly #page: Page
  readonly #frames: (n: number) => Promise<void>

  constructor(page: Page, frames: (n: number) => Promise<void>) {
    this.#page = page
    this.#frames = frames
  }

  /** Hold the right controller at `from`, its ray pointing at `at`. */
  async pointRight(from: Vec3, at: Vec3): Promise<void> {
    await this.point(Hand.RIGHT, from, at)
  }

  async point(hand: Hand, from: Vec3, at: Vec3): Promise<void> {
    await this.#page.evaluate(
      ([hand, from, at]) => {
        const controller = window.headset.controllers[hand]!
        controller.position.x = from[0]
        controller.position.y = from[1]
        controller.position.z = from[2]
        // The rotation taking the ray's rest direction, -Z, onto the direction to `at`.
        const d = [at[0] - from[0], at[1] - from[1], at[2] - from[2]]
        const n = Math.hypot(d[0]!, d[1]!, d[2]!)
        const [x, y, z] = d.map((component) => component / n) as Vec3
        // cross((0,0,-1), d) and 1 + dot((0,0,-1), d), normalised.
        const q = [y, -x, 0, 1 - z]
        const m = Math.hypot(...q)
        controller.quaternion.set(q[0]! / m, q[1]! / m, q[2]! / m, q[3]! / m)
      },
      [XR_HAND[hand], from, at] as const
    )
  }

  async rightGrip(value: number): Promise<void> {
    await this.grip(Hand.RIGHT, value)
  }

  async grip(hand: Hand, value: number): Promise<void> {
    await this.#page.evaluate(([h, v]) => window.headset.controllers[h]!.updateButtonValue("squeeze", v), [
      XR_HAND[hand],
      value
    ] as const)
  }

  async trigger(hand: Hand, value: number): Promise<void> {
    await this.#page.evaluate(([h, v]) => window.headset.controllers[h]!.updateButtonValue("trigger", v), [
      XR_HAND[hand],
      value
    ] as const)
  }

  async rightTrigger(value: number): Promise<void> {
    await this.trigger(Hand.RIGHT, value)
  }

  /**
   * Point the right hand from `from` at `at` and click the trigger. A click
   * needs the frame seeing the trigger released to come within 800 ms of the
   * frame seeing it pressed (the ray pointer's clickThresholdMs), and under
   * load frames can be further apart than that: so the trigger is let go
   * as soon as the frame that saw it pressed is over.
   */
  async press(from: Vec3, at: Vec3): Promise<void> {
    await this.pointRight(from, at)
    await this.#frames(3)
    // One frame gap can still outlast the window: then press again.
    for (let tries = 1; ; tries++) {
      const clicks = await this.#page.evaluate(() => window.whereaboutsVr.clicks)
      await this.#page.evaluate(async (hand) => {
        const vr = window.whereaboutsVr
        const nextFrame = () =>
          new Promise<void>((resolve) => {
            const was = vr.frames
            const timer = setInterval(() => {
              if (vr.frames === was) return
              clearInterval(timer)
              resolve()
            })
          })
        const trigger = window.headset.controllers[hand]!
        trigger.updateButtonValue("trigger", 1)
        await nextFrame()
        trigger.updateButtonValue("trigger", 0)
        await nextFrame()
      }, XR_HAND[Hand.RIGHT])
      if ((await this.#page.evaluate(() => window.whereaboutsVr.clicks)) > clicks) return
      if (tries === 3) throw new Error("Three presses and no click")
      console.warn("  (no click: pressing again)")
    }
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
    await this.#page.evaluate(([h, id]) => window.headset.controllers[h]!.updateButtonValue(id, 1), [
      XR_HAND[hand],
      id
    ] as const)
    await this.#frames(3)
    await this.#page.evaluate(([h, id]) => window.headset.controllers[h]!.updateButtonValue(id, 0), [
      XR_HAND[hand],
      id
    ] as const)
    await this.#frames(3)
  }

  /** Hold a controller at `at`, turned by the quaternion `rotation` from its rest pose. */
  async hold(hand: Hand, at: Vec3, rotation: Quaternion): Promise<void> {
    await this.#page.evaluate(
      ([hand, at, r]) => {
        const c = window.headset.controllers[hand]!
        c.position.x = at[0]
        c.position.y = at[1]
        c.position.z = at[2]
        c.quaternion.set(r[0], r[1], r[2], r[3])
      },
      [XR_HAND[hand], at, rotation] as const
    )
  }
}
