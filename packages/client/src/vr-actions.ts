/**
 * The headset's buttons for what the page's lobby and game screens offer
 * beside the round: leaving, taking a seat, and the host's say over the
 * other players, who is picked by pointing at their row of the score table.
 */
import { signal } from "@preact/signals"
import { MAX_PLAYERS, type GameView, type PlayerView } from "@whereabouts/shared/protocol"
import type { Connection } from "./net"
import type { VrAction } from "./vr"
import type { VrTable } from "./vr/scores"

/** The player the host last pointed at in the headset's table. */
export const vrPicked = signal<string | undefined>(undefined)

type Row = VrTable["rows"][number]

/** For the host, a player's row picks them for Remove and Make host; pointing again lets go. */
export function pickable(view: GameView, p: PlayerView): Pick<Row, "select" | "selected"> {
  if (!view.you.isHost || p.id === view.you.id) return {}
  const picked = vrPicked.value === p.id
  return { selected: picked, select: () => (vrPicked.value = picked ? undefined : p.id) }
}

/** Remove and Make host for the player the host picked, each confirmed by a second press. */
export function hostActions(conn: Connection, view: GameView, playerId: string | undefined): VrAction[] {
  const p = view.you.isHost && playerId !== view.you.id ? view.players.find((x) => x.id === playerId) : undefined
  if (!p) return []
  return [
    {
      label: `Remove ${p.name}`,
      confirm: `Press again to remove ${p.name}`,
      press: () => {
        vrPicked.value = undefined
        conn.kick(p.id)
      }
    },
    ...(p.connected && !p.isHost
      ? [{ label: `Make ${p.name} host`, confirm: `Press again: ${p.name} hosts`, press: () => conn.makeHost(p.id) }]
      : [])
  ]
}

/** A watcher's way in, while a seat is free. */
export function takeSeat(conn: Connection, view: GameView, label: string): VrAction {
  return {
    label,
    press: () => conn.setRole(false),
    enabled: view.players.filter((p) => !p.watching).length < MAX_PLAYERS
  }
}
