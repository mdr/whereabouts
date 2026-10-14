import { useEffect, useRef } from "preact/hooks"
import type { GameView } from "@whereabouts/shared"
import type { Connection } from "../net"
import { roundCue, sound, type RoundState } from "../sound"

/**
 * The online game's sounds, driven by changes of view: the rising cue when a
 * round starts, the countdown timed to each round's deadline, and the
 * falling cue (instead of the alarm) when everyone finishes early, and
 * applause at the final results. The spray and eraser are the map's
 * business (MapView), and Pass and Clear play their own, where they happen.
 */
export function useGameSounds(conn: Connection, view: GameView | undefined): void {
  const prev = useRef<RoundState | undefined>(undefined)
  const lastDeadline = useRef<number | undefined>(undefined)
  const phase = view?.phase
  const round = view?.round?.index ?? view?.reveal?.index
  const deadline = view?.phase === "guessing" ? view.round?.deadline : undefined

  useEffect(() => {
    if (phase === undefined) return
    const next = { phase, round }
    const msLeft = lastDeadline.current === undefined ? 0 : conn.msUntil(lastDeadline.current)
    const cue = roundCue(prev.current, next, msLeft)
    if (cue === "roundStart") sound.cue("roundStart")
    if (cue === "finishedEarly") {
      sound.stopCountdown()
      sound.cue("finishedEarly")
    }
    if (cue === "results") {
      sound.stopCountdown()
      sound.play("applause")
    }
    prev.current = next
  }, [phase, round])

  // Each round's countdown, including one joined partway through (after a
  // refresh, say). Nothing cancels it when the round ends on time, so the
  // alarm plays out; finishing early stops it above.
  useEffect(() => {
    if (deadline === undefined) return
    lastDeadline.current = deadline
    sound.scheduleCountdown(conn.msUntil(deadline))
  }, [deadline])

  useEffect(() => () => sound.stopAll(), [])
}
