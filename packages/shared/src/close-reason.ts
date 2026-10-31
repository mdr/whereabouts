/**
 * Why the server closed a game connection, or would not open one. Sent as
 * the close's reason; the client puts it into words.
 */
export enum CloseReason {
  /** No game has the code asked for. */
  NO_SUCH_GAME = "NO_SUCH_GAME",
  /** The client speaks another protocol version than the server: a reload brings the server's build. */
  OUTDATED = "OUTDATED",
  /** No free code to host a new game under. */
  UNAVAILABLE = "UNAVAILABLE",
  REMOVED = "REMOVED",
  FINISHED = "FINISHED",
  FULL = "FULL",
  NO_ROOM_TO_WATCH = "NO_ROOM_TO_WATCH",
  /** The same player connected again from another tab. */
  REPLACED = "REPLACED",
  LEFT = "LEFT"
}

export function isCloseReason(s: string): s is CloseReason {
  return (Object.values(CloseReason) as string[]).includes(s)
}
