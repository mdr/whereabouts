import { MAX_PLAYERS, MAX_SPECTATORS } from "@whereabouts/shared/protocol/config"
import { type GameView } from "@whereabouts/shared/protocol/views"
import { Role, YouRoleType } from "@whereabouts/shared/roles"
import type { Connection } from "../../../../net/net"
import { Icon } from "../../../../ui/icons"
import { roleSwitchTestIds } from "./RoleSwitchTestIds"
import styles from "./RoleSwitch.module.css"

export const RoleSwitch = ({ conn, view, online }: { conn: Connection; view: GameView; online: boolean }) => {
  const seatsFull = view.players.length >= MAX_PLAYERS
  const watchersFull = view.spectators.length >= MAX_SPECTATORS
  return (
    <div class={styles.roleSwitch} data-testid={roleSwitchTestIds.roleSwitch}>
      {view.you.role.type === YouRoleType.SPECTATOR ? (
        <button
          onClick={() => conn.setRole(Role.PLAYER)}
          disabled={seatsFull || !online}
          title={seatsFull ? `All ${MAX_PLAYERS} seats are taken` : undefined}
        >
          <Icon name="play" /> Play instead
        </button>
      ) : (
        <button
          onClick={() => conn.setRole(Role.SPECTATOR)}
          disabled={watchersFull || !online}
          title="See every round without playing"
        >
          <Icon name="eye" /> Just watch
        </button>
      )}
    </div>
  )
}
