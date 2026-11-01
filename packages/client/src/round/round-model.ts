/**
 * What a game's round and reveal tell you, as data: the page (InGame,
 * Reveal) and the headset (game-vr-view.ts) each put it in their own words
 * and controls.
 */
import { colourCss, type CssColour } from "@whereabouts/shared/colours"
import {
  Phase,
  type GameView,
  type InPlayGameView,
  type RevealView,
  type RoundResultView,
  type RoundYouView
} from "@whereabouts/shared/protocol"
import { YouRoleType, type PlayingPlayerView } from "@whereabouts/shared/roles"
import {
  RevealShownType,
  SHOW_EVERYONE,
  SHOW_NOBODY,
  revealOrder,
  showPlayer,
  shownPlayerId,
  type RevealShown
} from "./reveal"

/** Why you are not painting, or have stopped. */
export enum RoundNote {
  WATCHING = "WATCHING",
  JOINED_LATE = "JOINED_LATE",
  DONE = "DONE"
}

export function roundNote({ role }: RoundYouView): RoundNote | undefined {
  switch (role.type) {
    case YouRoleType.SPECTATOR:
      return RoundNote.WATCHING
    case YouRoleType.JOINED_LATE:
      return RoundNote.JOINED_LATE
    case YouRoleType.PLAYING:
      return role.locked ? RoundNote.DONE : undefined
  }
}

/** Your paint's colour, as the others see it; none while you watch. */
export const ownColour = ({ role }: RoundYouView): CssColour | undefined =>
  role.type === YouRoleType.SPECTATOR ? undefined : colourCss(role.colour)

const isLastReveal = (reveal: Pick<RevealView, "index" | "total">): boolean => reveal.index + 1 >= reveal.total

/** The round under way or on show. */
export const roundOf = (view: InPlayGameView): Pick<RevealView, "index" | "total" | "question"> =>
  view.phase === Phase.GUESSING ? view.round : view.reveal

/** At the last reveal the host shows the final results instead. */
export const canEndGame = (view: GameView): boolean =>
  view.you.isHost && !(view.phase === Phase.REVEAL && isLastReveal(view.reveal))

export enum ShownRowType {
  EVERYONE = "EVERYONE",
  PLAYER = "PLAYER",
  HIDE_PAINT = "HIDE_PAINT"
}

/** A row of the reveal's list; picking it sets whose paint shows (revealShown) to `pick`. */
export type ShownRow = { selected: boolean; pick: RevealShown } & (
  | { type: ShownRowType.EVERYONE }
  | {
      type: ShownRowType.PLAYER
      player: PlayingPlayerView
      /** Undefined when they sat the round out. */
      result: RoundResultView | undefined
      you: boolean
      ready: boolean
    }
  | { type: ShownRowType.HIDE_PAINT }
)

export interface RevealModel {
  last: boolean
  /** Of the players here, not counting watchers. */
  readyCount: number
  presentCount: number
  /** Undefined for a watcher, who has no Ready. */
  ready: { done: boolean } | undefined
  /** The host's way on, without waiting. */
  next: { label: string } | undefined
  rows: ShownRow[]
}

export function revealModel(view: GameView, reveal: RevealView, shown: RevealShown): RevealModel {
  const ready = new Set(reveal.ready)
  const present = view.players.filter((player) => player.connected)
  const last = isLastReveal(reveal)
  return {
    last,
    readyCount: present.filter((player) => ready.has(player.id)).length,
    presentCount: present.length,
    ready: view.you.role.type === YouRoleType.SPECTATOR ? undefined : { done: ready.has(view.you.id) },
    next: view.you.isHost ? { label: last ? "Show final results" : "Next round" } : undefined,
    rows: [
      { type: ShownRowType.EVERYONE, selected: shown.type === RevealShownType.EVERYONE, pick: SHOW_EVERYONE },
      ...revealOrder(view.players, reveal.results).map(({ player, result }): ShownRow => ({
        type: ShownRowType.PLAYER,
        player,
        result,
        you: player.id === view.you.id,
        ready: ready.has(player.id),
        selected: shownPlayerId(shown) === player.id,
        pick: shownPlayerId(shown) === player.id ? SHOW_EVERYONE : showPlayer(player.id)
      })),
      {
        type: ShownRowType.HIDE_PAINT,
        selected: shown.type === RevealShownType.NOBODY,
        pick: shown.type === RevealShownType.NOBODY ? SHOW_EVERYONE : SHOW_NOBODY
      }
    ]
  }
}
