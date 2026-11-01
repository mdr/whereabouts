import type { PlayerColour } from "../colours.ts"
import type { Award } from "../awards/player-facts.ts"
import type { LatLon } from "../geo.ts"
import type { H3Cell, H3Resolution } from "../h3.ts"
import type { HintAxis, HintBand } from "../hints.ts"
import type { CommonsFile, FlagCode, OutlineId, PlaceId, PlayerId, PlayerName, RoomCode, WikiTitle } from "../ids.ts"
import {
  AnswerType,
  QuestionType,
  Surface,
  type FeatureType,
  type FlagClue,
  type NameClue,
  type PhotoClue
} from "../questions.ts"
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

/** What players see of a point answer while guessing: how near counts, not where. */
export interface PointAnswerView {
  type: AnswerType.POINT
  tolerance: Km
}

/** What players see of an area answer while guessing: its outline, which the prompt or flag gives away anyway. */
export interface AreaAnswerView {
  type: AnswerType.AREA
  tolerance: Km
  outline: OutlineId
  surface: Surface
}

export type AnswerView = PointAnswerView | AreaAnswerView

/** Painted on water: trimming drops paint on land. */
export const onWater = (answer: AnswerView): boolean =>
  answer.type === AnswerType.AREA && answer.surface === Surface.WATER

/** The outline to paint, on an area round. */
export const outlineOf = (answer: AnswerView): OutlineId | undefined =>
  answer.type === AnswerType.AREA ? answer.outline : undefined

interface LandmarkQuestionView {
  type: QuestionType.LANDMARK
  clue: PhotoClue
  answer: PointAnswerView
}

interface PlaceQuestionView {
  type: QuestionType.PLACE
  clue: NameClue
  answer: PointAnswerView
}

interface CountryQuestionView {
  type: QuestionType.COUNTRY
  clue: NameClue
  answer: AreaAnswerView
  /** Shown beside the country's name. */
  countryFlag?: FlagCode
}

interface FlagQuestionView {
  type: QuestionType.FLAG
  clue: FlagClue
  answer: AnswerView
}

interface FeatureQuestionView {
  type: QuestionType.FEATURE
  feature: FeatureType
  clue: NameClue
  answer: AreaAnswerView
}

interface StateQuestionView {
  type: QuestionType.STATE
  clue: NameClue
  answer: AnswerView
}

/** A question while it is asked, by type as Question is: never where its answer is. */
export type QuestionView =
  | LandmarkQuestionView
  | PlaceQuestionView
  | CountryQuestionView
  | FlagQuestionView
  | FeatureQuestionView
  | StateQuestionView

/** The flag a question shows: a flag round's, or the one beside a country's name. */
export const flagShown = (question: QuestionView): FlagCode | undefined => {
  if (question.type === QuestionType.FLAG) return question.clue.flag
  return question.type === QuestionType.COUNTRY ? question.countryFlag : undefined
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
  resolution: H3Resolution
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

export enum PictureType {
  PHOTO = "PHOTO",
  FLAG = "FLAG",
  SHAPE = "SHAPE",
  NONE = "NONE"
}

interface PhotoPicture {
  type: PictureType.PHOTO
  photo: CommonsFile
}

interface FlagPicture {
  type: PictureType.FLAG
  flag: FlagCode
}

/** A question's one picture: its photo, its flag, or the photo its reveal shows. */
export type Picture = PhotoPicture | FlagPicture

/** The shape a round asked to paint, for the results' thumbnail. */
export interface ShapePicture {
  type: PictureType.SHAPE
  outline: OutlineId
  centre: LatLon
}

interface NoPicture {
  type: PictureType.NONE
}

type PlayedRoundPicture = Picture | ShapePicture | NoPicture

/** A country round: its shape, with its flag beside its name where it has one. */
interface CountryPlayedRound {
  type: QuestionType.COUNTRY
  label: string
  picture: ShapePicture
  countryFlag?: FlagCode
}

/** An island, lake or sea: its shape. */
interface FeaturePlayedRound {
  type: QuestionType.FEATURE
  label: string
  feature: FeatureType
  picture: ShapePicture
}

/** Any other round: a state's shape where it was painted whole, else the round's photo or flag, if any. */
interface OtherPlayedRound {
  type: Exclude<QuestionType, QuestionType.COUNTRY | QuestionType.FEATURE>
  label: string
  picture: PlayedRoundPicture
}

/** A round of a finished game, for the final results: what it asked about. */
export type PlayedRound = CountryPlayedRound | FeaturePlayedRound | OtherPlayedRound

export interface FinalStanding {
  playerId: PlayerId
  /** As at the finish, so the results stand on their own. */
  name: PlayerName
  colour: PlayerColour
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
  /** Round 1's picture, so it is loaded before it starts. */
  upcoming?: Picture
}

export interface GuessingGameView extends GameViewBase {
  phase: Phase.GUESSING
  you: GuessingYouView
  round: RoundView
  /** The next round's picture, absent on the last round or where it has none. */
  upcoming?: Picture
}

export interface RevealGameView extends GameViewBase {
  phase: Phase.REVEAL
  you: RoundYouView
  reveal: RevealView
  upcoming?: Picture
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
