/**
 * What a game's reveal shows, on the page (screens/Reveal.tsx) and in the
 * headset (game-vr-view.ts) alike.
 */
import { signal } from "@preact/signals"
import type { PlayerView, RevealView, RoundResultView } from "@whereabouts/shared/protocol"
import type { Outline } from "@whereabouts/shared/questions"
import type { RevealedAnswer } from "./round"

export function revealedFromView(reveal: RevealView, outline: Outline | undefined): RevealedAnswer {
  return {
    label: reveal.label,
    wiki: reveal.wiki,
    answer: reveal.answer,
    outline,
    photo: reveal.photo
  }
}

/** Selection meaning "show nobody's paint", alongside undefined (everyone) and a player id. */
export const NONE = "none"

/** Whose paint the reveal shows. */
export const revealShown = signal<string | undefined>(undefined)

/** The results whose paint to show, best first. */
export function shownResults(results: RoundResultView[], shown: string | undefined): RoundResultView[] {
  return shown === NONE ? [] : results.filter((r) => r.paint && (shown === undefined || r.playerId === shown))
}

/**
 * Rows for the reveal list: this round's winner first. Everyone who played,
 * passes included, comes in score order, then anyone who sat the round out;
 * ties keep the standings order. Spectators are not listed: they never play.
 */
export function revealOrder(
  players: PlayerView[],
  results: RoundResultView[]
): { p: PlayerView; r?: RoundResultView }[] {
  const group = (r?: RoundResultView) => (r ? 0 : 1)
  return players
    .filter((p) => !p.watching)
    .sort((a, b) => a.rank - b.rank)
    .map((p) => ({ p, r: results.find((x) => x.playerId === p.id) }))
    .sort((a, b) => group(a.r) - group(b.r) || (b.r?.score ?? 0) - (a.r?.score ?? 0))
}
