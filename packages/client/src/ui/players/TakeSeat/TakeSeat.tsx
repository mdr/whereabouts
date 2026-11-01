import { MAX_PLAYERS } from "@whereabouts/shared/protocol/config"
import { type GameView } from "@whereabouts/shared/protocol/views"
import { Role } from "@whereabouts/shared/roles"
import type { Connection } from "../../../net/net"
import { Icon } from "../../icons"
import styles from "./TakeSeat.module.css"

/**
 * For a spectator mid-game: join in as a player, sitting out the round under
 * way and playing from the next question. Off while every seat is taken.
 */
export const TakeSeatButton = ({ conn, view, inCard }: { conn: Connection; view: GameView; inCard?: boolean }) => {
  const full = view.players.length >= MAX_PLAYERS
  return (
    <button
      class={inCard ? styles.inCard : undefined}
      onClick={() => conn.setRole(Role.PLAYER)}
      disabled={full || !conn.online.value}
      title={full ? `All ${MAX_PLAYERS} player seats are taken` : "Play from the next question"}
    >
      <Icon name="play" /> Play from the next question
    </button>
  )
}
