import type { Connection } from "../net"

/** Reconnecting, or the server's last complaint; undefined while all is well. */
export function connectionText(conn: Connection): string | undefined {
  if (conn.status.value !== "connected") return "Reconnecting…"
  return conn.lastError.value
}

export function ConnectionNote({ conn }: { conn: Connection }) {
  const text = connectionText(conn)
  if (text === undefined) return undefined
  return <p class={`hint ${conn.status.value !== "connected" ? "warn" : ""}`}>{text}</p>
}
