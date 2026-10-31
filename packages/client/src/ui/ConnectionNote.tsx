import { type Connection, ConnectionStatus } from "../net"
import { cx } from "./cx"
import kit from "./kit.module.css"

/** Reconnecting, or the server's last complaint; undefined while all is well. */
export function connectionText(conn: Connection): string | undefined {
  if (conn.status.value !== ConnectionStatus.CONNECTED) return "Reconnecting…"
  return conn.lastError.value
}

export function ConnectionNote({ conn }: { conn: Connection }) {
  const text = connectionText(conn)
  if (text === undefined) return undefined
  return <p class={cx(kit.hint, conn.status.value !== ConnectionStatus.CONNECTED && kit.warn)}>{text}</p>
}
