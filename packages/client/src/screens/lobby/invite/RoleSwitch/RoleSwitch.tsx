import { MAX_SPECTATORS } from "@whereabouts/shared/protocol/config"
import { type GameView } from "@whereabouts/shared/protocol/views"
import { Role, YouRoleType } from "@whereabouts/shared/roles"
import { useGameService } from "../../../../game-service/use-game-service"
import { Icon } from "../../../../ui/icons"
import { canTakeSeat, seatsTakenTitle } from "../../../../ui/players/seat-rules"
import { roleSwitchTestIds } from "./RoleSwitchTestIds"
import styles from "./RoleSwitch.module.css"

export const RoleSwitch = ({ view }: { view: GameView }) => {
  const game = useGameService()
  const watchersFull = view.spectators.length >= MAX_SPECTATORS
  return (
    <div class={styles.roleSwitch} data-testid={roleSwitchTestIds.roleSwitch}>
      {view.you.role.type === YouRoleType.SPECTATOR ? (
        <button
          onClick={() => game.setRole(Role.PLAYER)}
          disabled={!canTakeSeat(view, game.online.value)}
          title={seatsTakenTitle(view)}
          data-testid={roleSwitchTestIds.playInsteadButton}
        >
          <Icon name="play" /> Play instead
        </button>
      ) : (
        <button
          onClick={() => game.setRole(Role.SPECTATOR)}
          disabled={watchersFull || !game.online.value}
          title="See every round without playing"
          data-testid={roleSwitchTestIds.justWatchButton}
        >
          <Icon name="eye" /> Just watch
        </button>
      )}
    </div>
  )
}
