import { MAX_PLAYERS, MAX_SPECTATORS } from "@whereabouts/shared/protocol/config"
import { type GameView } from "@whereabouts/shared/protocol/views"
import { Role, YouRoleType } from "@whereabouts/shared/roles"
import { useGameService } from "../../../../game-service/use-game-service"
import { Icon } from "../../../../ui/icons"
import { roleSwitchTestIds } from "./RoleSwitchTestIds"
import styles from "./RoleSwitch.module.css"

export const RoleSwitch = ({ view }: { view: GameView }) => {
  const game = useGameService()
  const seatsFull = view.players.length >= MAX_PLAYERS
  const watchersFull = view.spectators.length >= MAX_SPECTATORS
  return (
    <div class={styles.roleSwitch} data-testid={roleSwitchTestIds.roleSwitch}>
      {view.you.role.type === YouRoleType.SPECTATOR ? (
        <button
          onClick={() => game.setRole(Role.PLAYER)}
          disabled={seatsFull || !game.online.value}
          title={seatsFull ? `All ${MAX_PLAYERS} seats are taken` : undefined}
        >
          <Icon name="play" /> Play instead
        </button>
      ) : (
        <button
          onClick={() => game.setRole(Role.SPECTATOR)}
          disabled={watchersFull || !game.online.value}
          title="See every round without playing"
        >
          <Icon name="eye" /> Just watch
        </button>
      )}
    </div>
  )
}
