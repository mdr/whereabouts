import { type Connection, ConnectionStatus } from "../../../net/net"
import { Card } from "../../Card/Card"
import { cx } from "../../cx"
import kit from "../../kit.module.css"
import s from "./ConnectionNote.module.css"

/** Reconnecting, or the server's last complaint; undefined while all is well. */
export function connectionText(conn: Connection): string | undefined {
  if (conn.status.value.type !== ConnectionStatus.CONNECTED) return "Reconnecting…"
  return conn.lastError.value
}

/** `onMap`: on a card of its own, since bare text over the map is hard to read. */
export function ConnectionNote({ conn, onMap }: { conn: Connection; onMap?: boolean }) {
  const text = connectionText(conn)
  if (text === undefined) return undefined
  const note = (
    <p
      class={cx(kit.hint, conn.status.value.type !== ConnectionStatus.CONNECTED && kit.warn, onMap && s.onMap)}
      role="status"
    >
      {text}
    </p>
  )
  return onMap ? <Card>{note}</Card> : note
}
