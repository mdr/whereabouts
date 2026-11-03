import { CloseReason } from "@whereabouts/shared/close-reason"

/** How a game's reason for closing a connection reads in logs and metric labels. */
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
