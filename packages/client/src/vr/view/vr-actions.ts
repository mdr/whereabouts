/**
 * The headset's buttons for what the page's lobby and game screens offer
 * beside the round: leaving, taking a seat, and the host's say over the
 * other players, who is picked by pointing at their row of the score table.
 */
import { signal } from "@preact/signals"
import type { PlayerId } from "@whereabouts/shared/ids"
import { MAX_PLAYERS } from "@whereabouts/shared/protocol/config"
import { type GameView } from "@whereabouts/shared/protocol/views"
import { Role, everyone, type PlayerView } from "@whereabouts/shared/roles"
import type { GameService } from "../../game-service/game-service"
import type { VrAction } from "./view"
import type { VrTableRow } from "../scores/scores"

/** The player the host last pointed at in the headset's table. */
export const vrPicked = signal<PlayerId | undefined>(undefined)

/** For the host, a player's row picks them for Remove and Make host; pointing again lets go. */
export const pickable = (view: GameView, player: PlayerView): Pick<VrTableRow, "select" | "selected"> => {
  if (!view.you.isHost || player.id === view.you.id) return {}
  const picked = vrPicked.value === player.id
  return { selected: picked, select: () => (vrPicked.value = picked ? undefined : player.id) }
}

/** Remove and Make host for the player the host picked, each confirmed by a second press. */
export const hostActions = (
  game: Pick<GameService, "kick" | "makeHost" | "online">,
  view: GameView,
  playerId: PlayerId | undefined
): VrAction[] => {
  const player =
    view.you.isHost && playerId !== view.you.id
      ? everyone(view).find((candidate) => candidate.id === playerId)
      : undefined
  if (!player) return []
  return [
    {
      label: `Remove ${player.name}`,
      enabled: game.online.value,
      confirm: `Press again to remove ${player.name}`,
      press: () => {
        vrPicked.value = undefined
        game.kick(player.id)
      }
    },
    ...(player.connected && !player.isHost
      ? [
          {
            label: `Make ${player.name} host`,
            enabled: game.online.value,
            confirm: `Press again: ${player.name} hosts`,
            press: () => game.makeHost(player.id)
          }
        ]
      : [])
  ]
}

/** A watcher's way in, while a seat is free. */
export const takeSeat = (game: Pick<GameService, "setRole" | "online">, view: GameView, label: string): VrAction => ({
  label,
  press: () => game.setRole(Role.PLAYER),
  enabled: view.players.length < MAX_PLAYERS && game.online.value
})
