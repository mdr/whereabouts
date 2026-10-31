/**
 * Why the server closed a game connection, or would not open one. Sent as
 * the close's reason; the client puts it into words.
 */
// The values are what clients of older builds read: an outdated one must still recognise "outdated" to offer a reload.
export enum CloseReason {
  /** No game has the code asked for. */
  NO_SUCH_GAME = "noSuchGame",
  /** The client speaks another protocol version than the server: a reload brings the server's build. */
  OUTDATED = "outdated",
  /** No free code to host a new game under. */
  UNAVAILABLE = "unavailable",
  REMOVED = "removed",
  FINISHED = "finished",
  FULL = "full",
  NO_ROOM_TO_WATCH = "noRoomToWatch",
  /** The same player connected again from another tab. */
  REPLACED = "replaced",
  LEFT = "left"
}

export function isCloseReason(s: string): s is CloseReason {
  return (Object.values(CloseReason) as string[]).includes(s)
}
