import type { GameService } from "../../../game-service/game-service"
import { ConnectionStatus } from "../../../game-service/connection-state"
import { useGameService } from "../../../game-service/use-game-service"
import { Card } from "../../Card/Card"
import { cx } from "../../cx"
import kit from "../../kit.module.css"
import styles from "./ConnectionNote.module.css"

/** Reconnecting, or the server's last complaint; undefined while all is well. */
export const connectionText = (game: Pick<GameService, "status" | "lastError">): string | undefined => {
  if (game.status.value.type !== ConnectionStatus.CONNECTED) return "Reconnecting…"
  return game.lastError.value
}

/** `onMap`: on a card of its own, since bare text over the map is hard to read. */
export const ConnectionNote = ({ onMap }: { onMap?: boolean }) => {
  const game = useGameService()
  const text = connectionText(game)
  if (text === undefined) return undefined
  const note = (
    <p
      class={cx(kit.hint, game.status.value.type !== ConnectionStatus.CONNECTED && kit.warn, onMap && styles.onMap)}
      role="status"
    >
      {text}
    </p>
  )
  return onMap ? <Card>{note}</Card> : note
}
