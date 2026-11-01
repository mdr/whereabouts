/** Which of the game's cues a change of view calls for (see useGameSounds). */
import { Phase } from "@whereabouts/shared/protocol"
import type { Ms } from "@whereabouts/shared/units"

export interface RoundState {
  phase: Phase
  /** Index of the round being played or revealed, if any. */
  round: number | undefined
}

export enum RoundCue {
  ROUND_START = "ROUND_START",
  FINISHED_EARLY = "FINISHED_EARLY",
  RESULTS = "RESULTS"
}

/** More than this left when a round ends counts as finishing early rather than on time. */
const EARLY: Ms = 750

/**
 * The cue a change of game state calls for. A round starting (from the lobby
 * or the reveal) gets the rising pair. A round ending with time still on the
 * clock means everyone finished early: the falling pair, and the countdown
 * stops before its alarm; ending on time lets the alarm play out. Reaching
 * the final results gets applause (and stops a countdown, if the host ended
 * the game mid-round). `previous` is undefined on the first view after loading, which
 * never cues anything: a refresh should not announce what is already there.
 */
export function roundCue(
  previous: RoundState | undefined,
  next: RoundState,
  timeLeftAtChange: Ms
): RoundCue | undefined {
  if (!previous) return undefined
  if (next.phase === Phase.GUESSING && (previous.phase !== Phase.GUESSING || previous.round !== next.round))
    return RoundCue.ROUND_START
  if (previous.phase === Phase.GUESSING && next.phase === Phase.REVEAL)
    return timeLeftAtChange > EARLY ? RoundCue.FINISHED_EARLY : undefined
  if (next.phase === Phase.RESULTS && previous.phase !== Phase.RESULTS) return RoundCue.RESULTS
  return undefined
}
