import { CloseReason, isCloseReason } from "@whereabouts/shared/close-reason"
import { MAX_PLAYERS, MAX_SPECTATORS } from "@whereabouts/shared/protocol/config"

/** What the page offers after a rejection. */
export enum RejectionAction {
  /** The server could not be reached, so trying again may work. */
  RETRY = "RETRY",
  /** No game has the code, so the player may host one under it. */
  HOST_UNDER_CODE = "HOST_UNDER_CODE",
  /** The host removed this player; the client forgets its seat token. */
  FORGET_SEAT = "FORGET_SEAT",
  NONE = "NONE"
}

export interface Rejection {
  title: string
  detail: string
  action: RejectionAction
}

/**
 * Turn a WebSocket close code and its reason into something a player can
 * act on. Reasons are our CloseReason codes, or Rivalis's own for the room
 * closing and for giving up on reconnecting.
 */
export function describeDisconnect(code: number, reason: string | undefined): Rejection {
  const reasonText = reason ?? ""
  if (reasonText === "room_destroyed") {
    return {
      title: "That game has ended",
      detail: "Everyone left, so the room was closed. Game codes only live while someone is in the game.",
      action: RejectionAction.NONE
    }
  }
  if (reasonText === "reconnect_failed") {
    return {
      title: "Lost the connection",
      detail: "We could not reach the game server. Check your network and try again.",
      action: RejectionAction.RETRY
    }
  }
  if (!isCloseReason(reasonText))
    return {
      title: "Disconnected",
      detail: reasonText || `The connection closed (code ${code}).`,
      action: RejectionAction.NONE
    }
  switch (reasonText) {
    case CloseReason.NO_SUCH_GAME:
      return {
        title: "No game with that code",
        detail:
          "Check the code with your host. If the game finished or everyone left, you can host a new one under the same code.",
        action: RejectionAction.HOST_UNDER_CODE
      }
    case CloseReason.OUTDATED:
      return { title: "A new version is out", detail: "Reload the page to carry on.", action: RejectionAction.NONE }
    case CloseReason.UNAVAILABLE:
      return {
        title: "Couldn't start a game",
        detail: "The server had no free game code. Try again in a moment.",
        action: RejectionAction.NONE
      }
    case CloseReason.REMOVED:
      return {
        title: "You were removed from the game",
        detail: "The host took you out of this game. You can rejoin with the code as a new player, or start your own.",
        action: RejectionAction.FORGET_SEAT
      }
    case CloseReason.FINISHED:
      return {
        title: "That game has finished",
        detail: "The final results are in. Ask the host to start a new game.",
        action: RejectionAction.NONE
      }
    case CloseReason.FULL:
      return {
        title: "That game is full",
        detail: `It already has ${MAX_PLAYERS} players and ${MAX_SPECTATORS} people watching, the most a game can hold. Ask the host to remove someone, or start your own game.`,
        action: RejectionAction.NONE
      }
    case CloseReason.NO_ROOM_TO_WATCH:
      return {
        title: "No room to watch",
        detail: `${MAX_SPECTATORS} people are already watching that game, the most it allows. You can still join it as a player.`,
        action: RejectionAction.NONE
      }
    case CloseReason.REPLACED:
      return {
        title: "You joined from another tab",
        detail: "This game is now open in your newer tab, so this one has been signed out.",
        action: RejectionAction.NONE
      }
    case CloseReason.LEFT:
      return {
        title: "You left the game",
        detail: "Rejoin with the code, or start your own game.",
        action: RejectionAction.NONE
      }
    case CloseReason.SERVER_RESTARTED:
      return {
        title: "The server restarted for an update",
        detail: "That game has ended. The host can start a new one.",
        action: RejectionAction.NONE
      }
  }
}
