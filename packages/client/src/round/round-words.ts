/** What the page and the headset both say about a round and its reveal, so they say the same. */
import type { RoundResultView } from "@whereabouts/shared/protocol/views"
import { PASS_SCORE } from "@whereabouts/shared/scoring/scoring"
import { RoundNote } from "./round-model"

export function noteText(note: RoundNote, { askedToWatch, canUnlock }: { askedToWatch: boolean; canUnlock: boolean }) {
  switch (note) {
    case RoundNote.WATCHING:
      return askedToWatch
        ? "You're watching this game. You'll see each answer and everyone's guesses at the reveal."
        : "The game was full, so you're watching. You'll see each answer and everyone's guesses at the reveal."
    case RoundNote.JOINED_LATE:
      return "You joined mid-round, so you're watching this one. You'll play from the next question."
    case RoundNote.DONE:
      return `You're done. The round ends when everyone is, or when the clock runs out.${canUnlock ? " Changed your mind? Keep editing." : ""}`
  }
}

/** Under the Pass button, while nothing is painted. */
export const PASS_NOTE = `Passing scores ${PASS_SCORE.score}; a vague guess usually scores more.`

export const readyCountText = (ready: number, present: number): string => `${ready} of ${present} ready`

/** The Ready button once pressed. */
export const WAITING_FOR_OTHERS = "Waiting for the others…"

/** A pass scores too, so it shows its score like any other round. */
export const roundScoreText = (result: RoundResultView | undefined): string =>
  result ? `+${Math.round(result.score)}` : "sat out"
