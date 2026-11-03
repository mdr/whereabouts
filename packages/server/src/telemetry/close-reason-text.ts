import { CloseReason } from "@whereabouts/shared/close-reason"

/** How a game's reason for closing a connection reads in logs. */
export const CLOSE_REASON_TEXT: Record<CloseReason, string> = {
  [CloseReason.NO_SUCH_GAME]: "noSuchGame",
  [CloseReason.OUTDATED]: "outdated",
  [CloseReason.UNAVAILABLE]: "unavailable",
  [CloseReason.REMOVED]: "removed",
  [CloseReason.FINISHED]: "finished",
  [CloseReason.FULL]: "full",
  [CloseReason.NO_ROOM_TO_WATCH]: "noRoomToWatch",
  [CloseReason.REPLACED]: "replaced",
  [CloseReason.LEFT]: "left",
  [CloseReason.SERVER_RESTARTED]: "serverRestarted"
}

/** How a game's reason for closing a connection reads as a metric label value. */
export const CLOSE_REASON_LABEL: Record<CloseReason, string> = {
  [CloseReason.NO_SUCH_GAME]: "no_such_game",
  [CloseReason.OUTDATED]: "outdated",
  [CloseReason.UNAVAILABLE]: "unavailable",
  [CloseReason.REMOVED]: "removed",
  [CloseReason.FINISHED]: "finished",
  [CloseReason.FULL]: "full",
  [CloseReason.NO_ROOM_TO_WATCH]: "no_room_to_watch",
  [CloseReason.REPLACED]: "replaced",
  [CloseReason.LEFT]: "left",
  [CloseReason.SERVER_RESTARTED]: "server_restarted"
}
