/**
 * What a game's round and reveal tell you, as data: the page (InGame,
 * Reveal) and the headset (game-vr-view.ts) each put it in their own words
 * and controls.
 */
import type { GameView, PlayerView, RevealView, RoundResultView } from "@whereabouts/shared/protocol"
import { NONE, revealOrder } from "./reveal"

/** Why you are not painting, or have stopped. */
export enum RoundNote {
  WATCHING = "WATCHING",
  JOINED_LATE = "JOINED_LATE",
  DONE = "DONE"
}

export function roundNote(you: GameView["you"]): RoundNote | undefined {
  if (you.watching) return RoundNote.WATCHING
  if (you.sittingOut) return RoundNote.JOINED_LATE
  if (you.locked) return RoundNote.DONE
  return undefined
}

const isLastReveal = (reveal: Pick<RevealView, "index" | "total">): boolean => reveal.index + 1 >= reveal.total

/** At the last reveal the host shows the final results instead. */
export const canEndGame = (view: GameView): boolean => view.you.isHost && !(view.reveal && isLastReveal(view.reveal))

export enum ShownRowType {
  EVERYONE = "EVERYONE",
  PLAYER = "PLAYER",
  HIDE_PAINT = "HIDE_PAINT"
}

/** A row of the reveal's list; picking it sets whose paint shows (revealShown) to `pick`. */
export type ShownRow = { selected: boolean; pick: string | undefined } & (
  | { type: ShownRowType.EVERYONE }
  | {
      type: ShownRowType.PLAYER
      player: PlayerView
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

export function revealModel(view: GameView, reveal: RevealView, shown: string | undefined): RevealModel {
  const ready = new Set(reveal.ready)
  const present = view.players.filter((p) => p.connected && !p.watching)
  const last = isLastReveal(reveal)
  return {
    last,
    readyCount: present.filter((p) => ready.has(p.id)).length,
    presentCount: present.length,
    ready: view.you.watching ? undefined : { done: view.you.id !== undefined && ready.has(view.you.id) },
    next: view.you.isHost ? { label: last ? "Show final results" : "Next round" } : undefined,
    rows: [
      { type: ShownRowType.EVERYONE, selected: shown === undefined, pick: undefined },
      ...revealOrder(view.players, reveal.results).map(({ p, r }): ShownRow => ({
        type: ShownRowType.PLAYER,
        player: p,
        result: r,
        you: p.id === view.you.id,
        ready: ready.has(p.id),
        selected: shown === p.id,
        pick: shown === p.id ? undefined : p.id
      })),
      { type: ShownRowType.HIDE_PAINT, selected: shown === NONE, pick: shown === NONE ? undefined : NONE }
    ]
  }
}
