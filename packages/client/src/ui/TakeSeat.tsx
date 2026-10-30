import { MAX_PLAYERS, type GameView } from "@whereabouts/shared/protocol"
import type { Connection } from "../net"
import { Icon } from "./icons"
import s from "./TakeSeat.module.css"

/**
 * For a spectator mid-game: join in as a player, sitting out the round under
 * way and playing from the next question. Off while every seat is taken.
 */
export function TakeSeatButton({ conn, view, inCard }: { conn: Connection; view: GameView; inCard?: boolean }) {
  const full = view.players.filter((p) => !p.watching).length >= MAX_PLAYERS
  return (
    <button
      class={inCard ? s.inCard : undefined}
      onClick={() => conn.setRole(false)}
      disabled={full}
      title={full ? `All ${MAX_PLAYERS} player seats are taken` : "Play from the next question"}
    >
      <Icon name="play" /> Play from the next question
    </button>
  )
}
