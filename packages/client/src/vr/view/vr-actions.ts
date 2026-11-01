/**
 * The headset's buttons for what the page's lobby and game screens offer
 * beside the round: leaving, taking a seat, and the host's say over the
 * other players, who is picked by pointing at their row of the score table.
 */
import { signal } from "@preact/signals"
import type { PlayerId } from "@whereabouts/shared/ids"
import { MAX_PLAYERS, type GameView } from "@whereabouts/shared/protocol"
import { Role, everyone, type PlayerView } from "@whereabouts/shared/roles"
import type { Connection } from "../../net/net"
import type { VrAction } from "./view"
import type { VrTable } from "../scores/scores"

/** The player the host last pointed at in the headset's table. */
export const vrPicked = signal<PlayerId | undefined>(undefined)

type Row = VrTable["rows"][number]

/** For the host, a player's row picks them for Remove and Make host; pointing again lets go. */
export function pickable(view: GameView, player: PlayerView): Pick<Row, "select" | "selected"> {
  if (!view.you.isHost || player.id === view.you.id) return {}
  const picked = vrPicked.value === player.id
  return { selected: picked, select: () => (vrPicked.value = picked ? undefined : player.id) }
}

/** Remove and Make host for the player the host picked, each confirmed by a second press. */
export function hostActions(
  conn: Pick<Connection, "kick" | "makeHost">,
  view: GameView,
  playerId: PlayerId | undefined
): VrAction[] {
  const player =
    view.you.isHost && playerId !== view.you.id
      ? everyone(view).find((candidate) => candidate.id === playerId)
      : undefined
  if (!player) return []
  return [
    {
      label: `Remove ${player.name}`,
      confirm: `Press again to remove ${player.name}`,
      press: () => {
        vrPicked.value = undefined
        conn.kick(player.id)
      }
    },
    ...(player.connected && !player.isHost
      ? [
          {
            label: `Make ${player.name} host`,
            confirm: `Press again: ${player.name} hosts`,
            press: () => conn.makeHost(player.id)
          }
        ]
      : [])
  ]
}

/** A watcher's way in, while a seat is free. */
export function takeSeat(conn: Pick<Connection, "setRole">, view: GameView, label: string): VrAction {
  return {
    label,
    press: () => conn.setRole(Role.PLAYER),
    enabled: view.players.length < MAX_PLAYERS
  }
}
