import { MAX_PLAYERS, MAX_SPECTATORS, type GameView } from "@whereabouts/shared/protocol"
import type { Connection } from "../../../net/net"
import { Icon } from "../../../ui/icons"
import { roleSwitchTestIds } from "./RoleSwitchTestIds"
import s from "./RoleSwitch.module.css"

export function RoleSwitch({ conn, view, online }: { conn: Connection; view: GameView; online: boolean }) {
  const seatsFull = view.players.filter((p) => !p.watching).length >= MAX_PLAYERS
  const watchersFull = view.players.filter((p) => p.watching).length >= MAX_SPECTATORS
  return (
    <div class={s.roleSwitch} data-testid={roleSwitchTestIds.roleSwitch}>
      {view.you.watching ? (
        <button
          onClick={() => conn.setRole(false)}
          disabled={seatsFull || !online}
          title={seatsFull ? `All ${MAX_PLAYERS} seats are taken` : undefined}
        >
          <Icon name="play" /> Play instead
        </button>
      ) : (
        <button
          onClick={() => conn.setRole(true)}
          disabled={watchersFull || !online}
          title="See every round without playing"
        >
          <Icon name="eye" /> Just watch
        </button>
      )}
    </div>
  )
}
