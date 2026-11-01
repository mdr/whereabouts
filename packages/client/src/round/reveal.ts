/**
 * What a game's reveal shows, on the page (screens/Reveal.tsx) and in the
 * headset (game-vr-view.ts) alike.
 */
import { signal } from "@preact/signals"
import type { PlayerId } from "@whereabouts/shared/ids"
import { RoundGuessType, type PlayerView, type RevealView, type RoundResultView } from "@whereabouts/shared/protocol"
import type { Outline } from "@whereabouts/shared/questions"
import type { RevealedAnswer } from "./round"
import { revealedShape } from "./revealed-shape"

export function revealedFromView(reveal: RevealView, outline: Outline | undefined): RevealedAnswer {
  return {
    label: reveal.label,
    wiki: reveal.wiki,
    answer: reveal.answer,
    shape: revealedShape(reveal.question.answer, outline),
    photo: reveal.photo
  }
}

export enum RevealShownType {
  EVERYONE = "EVERYONE",
  NOBODY = "NOBODY",
  PLAYER = "PLAYER"
}

export interface EveryoneShown {
  type: RevealShownType.EVERYONE
}

export interface NobodyShown {
  type: RevealShownType.NOBODY
}

export interface PlayerShown {
  type: RevealShownType.PLAYER
  id: PlayerId
}

/** Whose paint the reveal shows. */
export type RevealShown = EveryoneShown | NobodyShown | PlayerShown

export const SHOW_EVERYONE: EveryoneShown = { type: RevealShownType.EVERYONE }
export const SHOW_NOBODY: NobodyShown = { type: RevealShownType.NOBODY }
export const showPlayer = (id: PlayerId): PlayerShown => ({ type: RevealShownType.PLAYER, id })

export const revealShown = signal<RevealShown>(SHOW_EVERYONE)

export const shownPlayerId = (shown: RevealShown): PlayerId | undefined =>
  shown.type === RevealShownType.PLAYER ? shown.id : undefined

/** The results whose paint to show, best first. */
export function shownResults(results: RoundResultView[], shown: RevealShown): RoundResultView[] {
  const painted = results.filter((r) => r.guess.type === RoundGuessType.PAINTED)
  switch (shown.type) {
    case RevealShownType.EVERYONE:
      return painted
    case RevealShownType.NOBODY:
      return []
    case RevealShownType.PLAYER:
      return painted.filter((r) => r.playerId === shown.id)
  }
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
