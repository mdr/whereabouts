import type { PlayerId } from "@whereabouts/shared/ids"
import type { PlayerView } from "@whereabouts/shared/roles"

/** Hosting passes to someone else who is here and not hosting already. */
export const canMakeHost = (you: PlayerId, player: PlayerView): boolean =>
  player.id !== you && player.connected && !player.isHost
