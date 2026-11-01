import type { Award } from "../awards/awards.ts"
import type { LatLon } from "../geo.ts"
import type { H3Cell, H3Res } from "../h3.ts"
import type { HintAxis, HintBand } from "../hints.ts"
import type { CommonsFile, FlagCode, OutlineId, PlaceId, PlayerId, PlayerName, RoomCode, WikiTitle } from "../ids.ts"
import { AnswerType, Surface, type Clue, type FeatureType, type QuestionType } from "../questions.ts"
import type { PlayingPlayerView, RoundYouRole, SpectatorView, YouRole } from "../roles.ts"
import type { AnswerParts } from "../scoring/regions.ts"
import type { Instant, Km, Points } from "../units.ts"
import type { GameConfig } from "./config.ts"

/** Sparse paint: H3 cell index -> intensity. Plus the uniform world floor. */
export interface PaintSubmission {
  cells: Record<H3Cell, number>
  floor: number
}

export enum Phase {
  LOBBY = "LOBBY",
  GUESSING = "GUESSING",
  REVEAL = "REVEAL",
  RESULTS = "RESULTS"
}

/** What players see of an answer while guessing: what to mark, not where. */
export type AnswerView =
  | { type: AnswerType.POINT; tolerance: Km }
  /** The outline, which the prompt or flag gives away anyway. */
  | { type: AnswerType.AREA; tolerance: Km; outline: OutlineId; surface: Surface }

/** Painted on water: trimming drops paint on land. */
export const onWater = (answer: AnswerView): boolean =>
  answer.type === AnswerType.AREA && answer.surface === Surface.WATER

/** The outline to paint, on an area round. */
export const outlineOf = (answer: AnswerView): OutlineId | undefined =>
  answer.type === AnswerType.AREA ? answer.outline : undefined

export interface QuestionView {
  type: QuestionType
  clue: Clue
  answer: AnswerView
  feature?: FeatureType
  /** Shown beside a country's name. */
  countryFlag?: FlagCode
}

interface RoundView {
  index: number
  total: number
  question: QuestionView
  /** Server epoch time when guessing ends. */
  deadline: Instant
}

export enum RoundGuessType {
  PASSED = "PASSED",
  PAINTED = "PAINTED"
}

/** The player made no guess, or painted nothing. */
export interface PassedGuess {
  type: RoundGuessType.PASSED
}

export interface PaintedGuess {
  type: RoundGuessType.PAINTED
  paint: PaintSubmission
  /** H3 resolution the paint was made at, for rendering. */
  res: H3Res
  /** What went into the score, by the rule that scored it. */
  parts: AnswerParts
}

export type RoundGuess = PassedGuess | PaintedGuess

export interface RoundResultView {
  playerId: PlayerId
  score: Points
  guess: RoundGuess
  /** The hint this player used on the round. */
  hint?: HintAxis
}

export interface RevealView {
  index: number
  total: number
  question: QuestionView
  answer: LatLon
  /** Whose facts the reveal shows. */
  place: PlaceId
  label: string
  /** Wikipedia article title for the answer. */
  wiki: WikiTitle
  /** A photo of the answer, on a round that showed none while guessing (see photos.ts). */
  photo?: CommonsFile
  results: RoundResultView[]
  /** Ids of players who have pressed Ready. The round advances when everyone connected has. */
  ready: PlayerId[]
}

/** The pictures a question shows, so a client can load the next round's before it starts. */
export interface QuestionPictures {
  image?: CommonsFile
  flag?: FlagCode
  /** Shown at the reveal (see photos.ts). */
  revealPhoto?: CommonsFile
}

/** A round of a finished game, for the final results: what it asked about. */
export interface PlayedRound extends QuestionPictures {
  label: string
  type: QuestionType
  feature?: FeatureType
  /** The area painted, where the round asked for a shape by name. */
  area?: { outline: OutlineId; centre: LatLon }
}

export interface FinalStanding {
  playerId: PlayerId
  total: Points
  /** Per round played; no score where the player sat out (joined late). Objects, since JSON turns undefined in an array into null. */
  rounds: { score?: Points }[]
}

interface YouBase {
  id: PlayerId
  name: PlayerName
  isHost: boolean
  /** While you host: who would take over if you left. */
  nextHost?: PlayerId
}

/** You, in the lobby and on the final results. */
interface YouView extends YouBase {
  role: YouRole
}

/** You, while a round is played or revealed. */
export interface RoundYouView extends YouBase {
  role: RoundYouRole
  /** Your hint on this round. */
  hint?: HintBand
}

/** You, while guessing. */
export interface GuessingYouView extends RoundYouView {
  /** Your own current submission, so a reconnect can restore it. Never anyone else's. */
  paint?: PaintSubmission
}

interface GameViewBase {
  code: RoomCode
  config: GameConfig
  serverTime: Instant
  players: PlayingPlayerView[]
  spectators: SpectatorView[]
}

export interface LobbyGameView extends GameViewBase {
  phase: Phase.LOBBY
  you: YouView
  /** Round 1's pictures, so they are loaded before it starts. */
  upcoming?: QuestionPictures
}

export interface GuessingGameView extends GameViewBase {
  phase: Phase.GUESSING
  you: GuessingYouView
  round: RoundView
  /** The next round's pictures, absent on the last round. */
  upcoming?: QuestionPictures
}

export interface RevealGameView extends GameViewBase {
  phase: Phase.REVEAL
  you: RoundYouView
  reveal: RevealView
  upcoming?: QuestionPictures
}

export interface ResultsGameView extends GameViewBase {
  phase: Phase.RESULTS
  you: YouView
  results: FinalStanding[]
  /** The rounds played, in order. */
  playedRounds: PlayedRound[]
  /** Prizes and booby prizes. */
  awards: Award[]
}

export type GameView = LobbyGameView | GuessingGameView | RevealGameView | ResultsGameView

/** A round being played or revealed: the map screen's views. */
export type InPlayGameView = GuessingGameView | RevealGameView

/** What a reveal shows that stays the same while it shows: the bulk of it, every player's paint. */
export type RoundReveal = Omit<RevealView, "ready">
