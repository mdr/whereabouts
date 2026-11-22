import type { PlayerId } from "@whereabouts/shared/ids"
import type { Analytics } from "./analytics"
import type { Logger } from "./logger"

/** What services take to log what happens and track what players do. */
export interface Telemetry {
  readonly logger: Logger
  readonly analytics: Analytics
  /** Tag later records with the player this tab is in a game, or with none. */
  identify(playerId: PlayerId | undefined): void
}
