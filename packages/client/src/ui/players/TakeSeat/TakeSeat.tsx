import { type GameView } from "@whereabouts/shared/protocol/views"
import { Role } from "@whereabouts/shared/roles"
import { useGameService } from "../../../game-service/use-game-service"
import { Icon } from "../../icons"
import { canTakeSeat, seatsTakenTitle } from "../seat-rules"
import { takeSeatTestIds } from "./TakeSeatTestIds"
import styles from "./TakeSeat.module.css"

/**
 * For a spectator mid-game: join in as a player, sitting out the round under
 * way and playing from the next question. Off while every seat is taken.
 */
export const TakeSeatButton = ({ view, inCard }: { view: GameView; inCard?: boolean }) => {
  const game = useGameService()
  return (
    <button
      class={inCard ? styles.inCard : undefined}
      onClick={() => game.setRole(Role.PLAYER)}
      disabled={!canTakeSeat(view, game.online.value)}
      title={seatsTakenTitle(view) ?? "Play from the next question"}
      data-testid={takeSeatTestIds.button}
    >
      <Icon name="play" /> Play from the next question
    </button>
  )
}
