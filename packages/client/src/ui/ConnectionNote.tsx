import type { Connection } from "../net";

export function ConnectionNote({ conn }: { conn: Connection }) {
  const s = conn.status.value;
  const err = conn.lastError.value;
  if (s === "connected" && !err) return null;
  return <p class={`hint ${s !== "connected" ? "warn" : ""}`}>{s !== "connected" ? "Reconnecting…" : err}</p>;
}
