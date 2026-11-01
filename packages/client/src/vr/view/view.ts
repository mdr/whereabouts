/** What the screens hand the headset to show. */
import type { CssColour } from "@whereabouts/shared/colours"
import type { HintAxis, HintBand } from "@whereabouts/shared/hints"
import type { LatLon } from "@whereabouts/shared/geo"
import type { MapDetail } from "@whereabouts/shared/protocol"
import type { PaintLayer } from "@whereabouts/shared/paint/paint"
import type { PaintController } from "../../paint/paint-controller"
import type { VrPicture } from "../picture/vr-picture"
import type { VrAnswer } from "../globe/answer"
import type { VrBoard } from "../scores/board"
import type { VrFlagPin } from "../globe/flag-pins"
import type { VrTable } from "../scores/scores"
import type { Ms } from "@whereabouts/shared/units"

/** How many hints are left: a count in a game, or one of these. */
export enum HintAllowance {
  /** Practice. */
  UNLIMITED = "UNLIMITED",
  /** A game with hints off. */
  NONE = "NONE"
}

export type HintsLeft = number | HintAllowance

export interface VrRound {
  paint: PaintController
  /** The question as the card words it. */
  prompt: string
  /** Over the prompt: which round of how many, and in practice the total so far. */
  heading?: string
  /** How to answer: the whole country's shape, or where a place is. */
  mode?: string
  /** The players while they guess: who is done, who is away. */
  table?: VrTable
  /** What the page's map shows while painting. */
  detail: MapDetail
  picture: VrPicture | undefined
  /** A lake or sea round: trimming drops paint on land, not at sea. */
  water: boolean
  /** Your paint's colour in a game, as the others see it; the map's ramp in practice. */
  colour?: CssColour
  hint: HintBand | undefined
  hintsLeft: HintsLeft
  useHint(axis: HintAxis): void
  /** Ms until guessing ends, in a timed round. */
  timeLeft?: () => Ms
  /** What Done is called; with nothing painted it is a pass, and says so. */
  doneLabel: string
  done(): void
  /** Done in a game, until Keep editing takes it back; undefined where it can't be. */
  unlock?: () => void
  /** Whether this player paints the round at all. */
  playing: boolean
  /** What the round means for this player just now: done, or sitting it out. */
  note?: string
}

/** A button on the menu: Next question, Ready, Play again. */
export interface VrAction {
  label: string
  press(): void
  enabled?: boolean
  /** For what can't be undone: the label a first press shows, asking for a second. */
  confirm?: string
}

/** After a round: its answer and score. */
export interface VrReveal {
  label: string
  answer: VrAnswer
  /** Where the globe turns to show the answer. */
  focus: LatLon
  /** The map then shows state lines and names, as the page's does. */
  stateRound: boolean
  /** A line of interest about the answer. */
  fact?: string
  scoreLine: string
  /** The paint shown in players' colours, as the score table picks it; your own paint when absent. */
  paints?: { layer: PaintLayer; colour: CssColour }[]
  table?: VrTable
  note?: string
  actions: VrAction[]
  /** On a flag round: every country's flag, on or off; `pins` once the borders have loaded. */
  flags?: { on: boolean; toggle: () => void; pins: VrFlagPin[] | undefined }
}

interface VrSummary {
  title: string
  scoreLine: string
  table?: VrTable
  note?: string
  actions: VrAction[]
  /** The awards and every round's scores, at the end of a game. */
  board?: VrBoard
}

export enum VrViewType {
  PAINT = "PAINT",
  REVEAL = "REVEAL",
  DONE = "DONE",
  /** Before a game: the home screen or a game's lobby. */
  LOBBY = "LOBBY"
}

interface VrViewCommon {
  /** Below the main actions: leaving, taking a seat, the host's controls. */
  more?: VrAction[]
}

interface VrPaintView extends VrViewCommon {
  type: VrViewType.PAINT
  round: VrRound
}

interface VrRevealView extends VrViewCommon {
  type: VrViewType.REVEAL
  round: VrRound
  reveal: VrReveal
}

interface VrDoneView extends VrViewCommon {
  type: VrViewType.DONE
  summary: VrSummary
}

interface VrLobbyView extends VrViewCommon {
  type: VrViewType.LOBBY
  summary: VrSummary
}

/** What the headset shows: a menu, a round to paint, its answer, or the final score. */
export type VrView = VrPaintView | VrRevealView | VrDoneView | VrLobbyView

/**
 * What the headset sets up afresh when it changes (Vr.show): the kind of
 * view and the question on it. Anything else, the clock, a hint, who is
 * ready, is a refresh.
 */
export function sceneOf(view: VrView): string {
  if (view.type !== VrViewType.PAINT && view.type !== VrViewType.REVEAL) return view.type
  const { prompt, picture } = view.round
  const shows = picture && ("photo" in picture ? picture.photo : picture.flag)
  return JSON.stringify([view.type, prompt, shows])
}
