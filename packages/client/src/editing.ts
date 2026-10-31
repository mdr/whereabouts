/** What you may do with your guess, the same on the page and in the headset. */
import { Phase, type GameView } from "@whereabouts/shared/protocol"

type EditView = Pick<GameView, "phase" | "you">

const playing = (view: EditView, timeUp: boolean): boolean =>
  view.phase === Phase.GUESSING && !view.you.sittingOut && !timeUp

/** Whether you can paint now. */
export const canPaint = (view: EditView, timeUp: boolean): boolean => playing(view, timeUp) && !view.you.locked

/** Whether you can take back Done. Once time is up the guess stands. */
export const canUnlock = (view: EditView, timeUp: boolean): boolean => playing(view, timeUp) && view.you.locked
