import { useEffect, useRef } from "preact/hooks"
import type { GuessingGameView, LobbyGameView, ResultsGameView, RevealView } from "@whereabouts/shared/protocol/views"
import type { Connection } from "../net/net"
import { Chime, sound } from "./sound"
import { RoundCue, roundCue, type RoundState } from "./round-cue"
import { Phase } from "@whereabouts/shared/protocol/views"

/** What the sounds follow in a game view. */
type SoundView =
  | Pick<LobbyGameView | ResultsGameView, "phase">
  | { phase: Phase.GUESSING; round: Pick<GuessingGameView["round"], "index" | "deadline"> }
  | { phase: Phase.REVEAL; reveal: Pick<RevealView, "index"> }

/**
 * The online game's sounds, driven by changes of view: the rising cue when a
 * round starts, the countdown timed to each round's deadline, and the
 * falling cue (instead of the alarm) when everyone finishes early, and
 * applause at the final results. The spray and eraser are the map's
 * business (MapView), and Pass and Clear play their own, where they happen.
 */
export function useGameSounds(conn: Pick<Connection, "timeUntil">, view: SoundView | undefined): void {
  const previous = useRef<RoundState | undefined>(undefined)
  const lastDeadline = useRef<number | undefined>(undefined)
  const phase = view?.phase
  const round =
    view?.phase === Phase.GUESSING ? view.round.index : view?.phase === Phase.REVEAL ? view.reveal.index : undefined
  const deadline = view?.phase === Phase.GUESSING ? view.round.deadline : undefined

  useEffect(() => {
    if (phase === undefined) return
    const next = { phase, round }
    const timeLeft = lastDeadline.current === undefined ? 0 : conn.timeUntil(lastDeadline.current)
    const cue = roundCue(previous.current, next, timeLeft)
    if (cue === RoundCue.ROUND_START) sound.chime(Chime.RISING)
    if (cue === RoundCue.FINISHED_EARLY) {
      sound.stopCountdown()
      sound.chime(Chime.FALLING)
    }
    if (cue === RoundCue.RESULTS) {
      sound.stopCountdown()
      sound.play("applause")
    }
    previous.current = next
  }, [phase, round])

  // Each round's countdown, including one joined partway through (after a
  // refresh, say). Nothing cancels it when the round ends on time, so the
  // alarm plays out; finishing early stops it above.
  useEffect(() => {
    if (deadline === undefined) return
    lastDeadline.current = deadline
    sound.scheduleCountdown(conn.timeUntil(deadline))
  }, [deadline])

  useEffect(() => () => sound.stopAll(), [])
}
