import { useEffect, useRef } from "preact/hooks";
import type { GameView } from "@whereabouts/shared";
import type { Connection } from "../net";
import { roundCue, sound, type RoundState } from "../sound";

/**
 * The online game's sounds, driven by changes of view: the rising cue when a
 * round starts, the countdown timed to each round's deadline, and the
 * falling cue (instead of the alarm) when everyone finishes early. The spray
 * is the map's business (MapView), since practice has it too.
 */
export function useGameSounds(conn: Connection, view: GameView | null): void {
  const prev = useRef<RoundState | null>(null);
  const lastDeadline = useRef<number | null>(null);
  const phase = view?.phase ?? null;
  const round = view?.round?.index ?? view?.reveal?.index ?? null;
  const deadline = view?.phase === "guessing" ? (view.round?.deadline ?? null) : null;

  useEffect(() => {
    if (phase === null) return;
    const next = { phase, round };
    const msLeft = lastDeadline.current === null ? 0 : conn.msUntil(lastDeadline.current);
    const cue = roundCue(prev.current, next, msLeft);
    if (cue === "roundStart") sound.cue("roundStart");
    if (cue === "finishedEarly") {
      sound.stopCountdown();
      sound.cue("finishedEarly");
    }
    if (cue === "stop") sound.stopCountdown();
    prev.current = next;
  }, [phase, round]);

  // Each round's countdown, including one joined partway through (after a
  // refresh, say). Nothing cancels it when the round ends on time, so the
  // alarm plays out; finishing early stops it above.
  useEffect(() => {
    if (deadline === null) return;
    lastDeadline.current = deadline;
    sound.scheduleCountdown(conn.msUntil(deadline));
  }, [deadline]);

  useEffect(() => () => sound.stopAll(), []);
}
