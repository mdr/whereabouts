/** What you may do with your guess, the same on the page and in the headset. */
import { Phase, type GameView } from "@whereabouts/shared/protocol/views"
import { YouRoleType, type YouPlaying } from "@whereabouts/shared/roles"

/** Your role as a player of a round still running, or none. */
const playingRole = (view: GameView, timeUp: boolean): YouPlaying | undefined =>
  view.phase === Phase.GUESSING && !timeUp && view.you.role.type === YouRoleType.PLAYING ? view.you.role : undefined

/** Whether you can paint now. */
export const canPaint = (view: GameView, timeUp: boolean): boolean => playingRole(view, timeUp)?.locked === false

/** Whether you can take back Done. Once time is up the guess stands. */
export const canUnlock = (view: GameView, timeUp: boolean): boolean => playingRole(view, timeUp)?.locked === true
