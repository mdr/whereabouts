import type { ComponentChildren } from "preact"

export interface ConfirmRequest {
  title: string
  body: ComponentChildren
  confirmLabel: string
  onConfirm: () => void
  /** Not something to undo with regret (handing over, say): a plain confirm button, not a red one. */
  safe?: boolean
}

/** The wording for removing a player, shared by every list that offers it. */
export const kickRequest = (name: string, onConfirm: () => void): ConfirmRequest => ({
  title: `Remove ${name} from the game?`,
  body: "They lose their score and paint, and can't take their seat back. They can rejoin with the code as a new player.",
  confirmLabel: `Remove ${name}`,
  onConfirm
})

/** The wording for handing the host role to another player. */
export const makeHostRequest = (name: string, onConfirm: () => void): ConfirmRequest => ({
  title: `Make ${name} the host?`,
  body: "They take over starting the game, the setup, moving on and removing players. You carry on as a player.",
  confirmLabel: `Make ${name} host`,
  onConfirm,
  safe: true
})

/** The host leaving the lobby: someone takes over, or the game closes. */
export const leaveRequest = (nextHost: string | undefined, onConfirm: () => void): ConfirmRequest =>
  nextHost
    ? {
        title: "Leave the game?",
        body: `${nextHost} becomes the host.`,
        confirmLabel: "Leave",
        onConfirm,
        safe: true
      }
    : {
        title: "Leave the game?",
        body: "It closes, since no one else is here.",
        confirmLabel: "Leave and close",
        onConfirm
      }

export const endGameRequest = (onConfirm: () => void): ConfirmRequest => ({
  title: "End the game now?",
  body: "This round is scored as it stands and everyone goes to the final standings.",
  confirmLabel: "End game",
  onConfirm
})
