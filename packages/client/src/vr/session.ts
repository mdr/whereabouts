/** The headset session, and switching it to or from passthrough. */
import { SessionMode, VisibilityState, type World } from "@iwsdk/core"
import { signal } from "@preact/signals"
import type { Ms } from "@whereabouts/shared/units"
import { headsetPassthrough } from "../settings/settings"
import { timerFrames } from "./frames"

type SessionWorld = Pick<World, "visibilityState" | "launchXR" | "exitXR">

export interface SessionHooks {
  /** A session of this kind is about to be asked for. */
  launching(passthrough: boolean): void
  /** The session has ended: put the scene away. */
  ended(): void
}

/** How long a new session may take to open, when switching to or from passthrough. */
export const SWITCH_TIMEOUT: Ms = 5000

export class HeadsetSession {
  readonly active = signal(false)
  /**
   * Ending one kind of session to start the other: the passthrough wanted,
   * saved only once its session opens, and whether that session has been asked for.
   */
  private switchingTo: boolean | undefined = undefined
  private switchOpening = false
  private readonly world: SessionWorld
  private readonly hooks: SessionHooks

  constructor(world: SessionWorld, hooks: SessionHooks) {
    this.world = world
    this.hooks = hooks
    world.visibilityState.subscribe((state) => this.visibilityChanged(state))
  }

  launch(passthrough = headsetPassthrough.value): void {
    this.hooks.launching(passthrough)
    this.world.launchXR({ sessionMode: passthrough ? SessionMode.ImmersiveAR : SessionMode.ImmersiveVR })
  }

  /** Swaps space for the room round the player, or back: a new session of the other kind. */
  togglePassthrough(): void {
    if (this.switchingTo !== undefined) return
    this.switchingTo = !headsetPassthrough.value
    this.world.exitXR()
  }

  exit(): void {
    if (this.active.value) this.world.exitXR()
  }

  private visibilityChanged(state: VisibilityState): void {
    const active = state !== VisibilityState.NonImmersive
    if (!active && this.switchingTo !== undefined && !this.switchOpening) {
      this.openSwitchedSession(this.switchingTo)
      return
    }
    if (active && this.switchingTo !== undefined) {
      headsetPassthrough.value = this.switchingTo
      this.switchingTo = undefined
      this.switchOpening = false
    }
    if (active === this.active.value) return
    if (active) {
      timerFrames(true)
      this.active.value = true
    } else this.ended()
  }

  private openSwitchedSession(passthrough: boolean): void {
    // Still within the press's activation, which a new session needs.
    this.switchOpening = true
    this.launch(passthrough)
    // Refused, it leaves the player on the page.
    setTimeout(() => {
      if (this.world.visibilityState.value === VisibilityState.NonImmersive) this.ended()
    }, SWITCH_TIMEOUT)
  }

  private ended(): void {
    // A refused switch keeps the old setting.
    this.switchingTo = undefined
    this.switchOpening = false
    if (!this.active.value) return
    timerFrames(false)
    this.active.value = false
    this.hooks.ended()
  }
}
