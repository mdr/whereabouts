/**
 * Why the server closed a game connection, or would not open one. Sent as
 * the close's reason; the client puts it into words.
 */
export const CLOSE_REASONS = [
  /** No game has the code asked for. */
  "noSuchGame",
  /** The client speaks another protocol version than the server: a reload brings the server's build. */
  "outdated",
  /** No free code to host a new game under. */
  "unavailable",
  "removed",
  "finished",
  "full",
  "noRoomToWatch",
  /** The same player connected again from another tab. */
  "replaced",
  "left"
] as const

export type CloseReason = (typeof CLOSE_REASONS)[number]

export function isCloseReason(s: string): s is CloseReason {
  return (CLOSE_REASONS as readonly string[]).includes(s)
}
