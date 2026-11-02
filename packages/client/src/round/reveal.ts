/**
 * What a game's reveal shows, on the page (screens/reveal/Reveal.tsx) and in the
 * headset (game-vr-view.ts) alike.
 */
import { signal } from "@preact/signals"
import type { PlayerId } from "@whereabouts/shared/ids"
import { RoundGuessType, type RevealView, type RoundResultView } from "@whereabouts/shared/protocol/views"
import type { PlayingPlayerView } from "@whereabouts/shared/roles"
import type { Outlines } from "@whereabouts/shared/questions"
import type { RevealedAnswer } from "./round"
import { revealedShape } from "./revealed-shape"

export const revealedFromView = (reveal: RevealView, outlines: Outlines | undefined): RevealedAnswer => ({
  label: reveal.label,
  wiki: reveal.wiki,
  answer: reveal.answer,
  shape: revealedShape(reveal.question.answer, outlines),
  photo: reveal.photo
})

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
export const shownResults = (results: RoundResultView[], shown: RevealShown): RoundResultView[] => {
  const painted = results.filter((result) => result.guess.type === RoundGuessType.PAINTED)
  switch (shown.type) {
    case RevealShownType.EVERYONE:
      return painted
    case RevealShownType.NOBODY:
      return []
    case RevealShownType.PLAYER:
      return painted.filter((result) => result.playerId === shown.id)
  }
}

/**
 * Rows for the reveal list: this round's winner first. Everyone who played,
 * passes included, comes in score order, then anyone who sat the round out;
 * ties keep the standings order. Spectators are not listed: they never play.
 */
export const revealOrder = (
  players: PlayingPlayerView[],
  results: RoundResultView[]
): { player: PlayingPlayerView; result?: RoundResultView }[] => {
  const group = (result?: RoundResultView) => (result ? 0 : 1)
  return [...players]
    .sort((a, b) => a.rank - b.rank)
    .map((player) => ({ player, result: results.find((result) => result.playerId === player.id) }))
    .sort(
      (left, right) =>
        group(left.result) - group(right.result) || (right.result?.score ?? 0) - (left.result?.score ?? 0)
    )
}
