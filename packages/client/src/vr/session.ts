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

enum SwitchType {
  NONE = "NONE",
  ENDING = "ENDING",
  OPENING = "OPENING"
}

interface NoSwitch {
  type: SwitchType.NONE
}

/** Ending one kind of session to start the other; `to` is the passthrough wanted, saved only once its session opens. */
interface EndingSwitch {
  type: SwitchType.ENDING
  to: boolean
}

/** The new session has been asked for. */
interface OpeningSwitch {
  type: SwitchType.OPENING
  to: boolean
}

type Switch = NoSwitch | EndingSwitch | OpeningSwitch

export class HeadsetSession {
  readonly active = signal(false)
  private switching: Switch = { type: SwitchType.NONE }
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
    if (this.switching.type !== SwitchType.NONE) return
    this.switching = { type: SwitchType.ENDING, to: !headsetPassthrough.value }
    this.world.exitXR()
  }

  exit(): void {
    if (this.active.value) this.world.exitXR()
  }

  private visibilityChanged(state: VisibilityState): void {
    const active = state !== VisibilityState.NonImmersive
    const switching = this.switching
    if (!active && switching.type === SwitchType.ENDING) {
      this.openSwitchedSession(switching.to)
      return
    }
    if (active && switching.type !== SwitchType.NONE) {
      headsetPassthrough.value = switching.to
      this.switching = { type: SwitchType.NONE }
    }
    if (active === this.active.value) return
    if (active) {
      timerFrames(true)
      this.active.value = true
    } else this.ended()
  }

  private openSwitchedSession(passthrough: boolean): void {
    // Still within the press's activation, which a new session needs.
    this.switching = { type: SwitchType.OPENING, to: passthrough }
    this.launch(passthrough)
    // Refused, it leaves the player on the page.
    setTimeout(() => {
      if (this.world.visibilityState.value === VisibilityState.NonImmersive) this.ended()
    }, SWITCH_TIMEOUT)
  }

  private ended(): void {
    // A refused switch keeps the old setting.
    this.switching = { type: SwitchType.NONE }
    if (!this.active.value) return
    timerFrames(false)
    this.active.value = false
    this.hooks.ended()
  }
}
