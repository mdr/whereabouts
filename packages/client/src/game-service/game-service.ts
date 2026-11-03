import type { ReadonlySignal } from "@preact/signals"
import type { ConfigurePatch } from "@whereabouts/shared/protocol/config"
import type { GameView, PaintSubmission } from "@whereabouts/shared/protocol/views"
import type { HintAxis } from "@whereabouts/shared/hints"
import type { PlayerId, PlayerName, RoomCode } from "@whereabouts/shared/ids"
import type { Role } from "@whereabouts/shared/roles"
import type { Instant, Ms } from "@whereabouts/shared/units"
import type { ConnectionState } from "./connection-state"

/** The game a screen shows: its state to read, and the commands a player can give. */
export interface GameService {
  readonly view: ReadonlySignal<GameView | undefined>
  readonly status: ReadonlySignal<ConnectionState>
  readonly lastError: ReadonlySignal<string | undefined>
  /** serverTime - Date.now(), so deadlines can be shown on the local clock. */
  readonly clockOffset: ReadonlySignal<Ms>
  readonly code: ReadonlySignal<RoomCode | undefined>
  /** Whether a command sent now reaches the server: only paint and Done are resent after a drop. */
  readonly online: ReadonlySignal<boolean>

  /** Try again after giving up: back into the game it was in, if any. */
  readonly rejoin: () => void
  readonly sendPaint: (paint: PaintSubmission) => void
  readonly lock: () => void
  readonly unlock: () => void
  readonly ready: () => void
  readonly configure: (patch: ConfigurePatch) => void
  readonly start: () => void
  readonly next: () => void
  readonly again: () => void
  readonly rename: (name: PlayerName) => void
  readonly hint: (axis: HintAxis) => void
  readonly kick: (playerId: PlayerId) => void
  /** Give up this seat for good (the lobby's Leave). */
  readonly leave: () => void
  /** In the lobby: watch instead of play, or take a free seat. */
  readonly setRole: (role: Role) => void
  readonly makeHost: (playerId: PlayerId) => void
  readonly end: () => void
  /** Local-clock ms until a server deadline. */
  readonly timeUntil: (at: Instant) => Ms
}
