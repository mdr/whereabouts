/**
 * Wire protocol between client and game server. Every message is JSON text on
 * a Rivalis topic, except paint, which is binary (see paint-wire.ts). Schemas
 * validate inbound data on the server; the inferred types are shared with the
 * client.
 */
import { z } from "zod"
import type { Award } from "./awards/awards.ts"
import type { LatLon } from "./geo.ts"
import { QUESTION_TYPES, QuestionType, AnswerType, Surface, type Clue, type FeatureType } from "./questions.ts"
import type { H3Cell, H3Res } from "./h3.ts"
import type { Instant, Km, Ms, Points } from "./units.ts"
import { paintFromBase64, paintToBase64 } from "./paint/paint-wire.ts"
import { HintAxisSchema, MAX_HINTS, type HintAxis, type HintBand } from "./hints.ts"
import type { KernelId } from "./scoring/scoring.ts"
import type { AnswerParts } from "./scoring/regions.ts"
import {
  PlayerIdSchema,
  PlayerNameSchema,
  PlayerTokenSchema,
  RoomCodeSchema,
  type CommonsFile,
  type FlagCode,
  type PlayerId,
  type OutlineId,
  type PlaceId,
  type PlayerName,
  type PlayerToken,
  type RoomCode,
  type WikiTitle
} from "./ids.ts"
import { CloseReason } from "./close-reason.ts"
import type { PlayingPlayerView, SpectatorView } from "./roles.ts"

export const PROTOCOL_VERSION = 15

/** Sparse paint: H3 cell index -> intensity. Plus the uniform world floor. */
export interface PaintSubmission {
  cells: Record<H3Cell, number>
  floor: number
}

export enum GameEntryType {
  HOST = "HOST",
  JOIN = "JOIN"
}

/** Host a game: under the given code if any (joining whoever already did), else a fresh one. */
interface HostEntry {
  type: GameEntryType.HOST
  code?: RoomCode
}
interface JoinEntry {
  type: GameEntryType.JOIN
  code: RoomCode
  /** A full game seats a would-be player as a spectator anyway. */
  watch: boolean
}
/** How a player comes into a game. */
export type GameEntry = HostEntry | JoinEntry

const GameEntrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(GameEntryType.HOST), code: RoomCodeSchema.optional() }),
  z.object({ type: z.literal(GameEntryType.JOIN), code: RoomCodeSchema, watch: z.boolean() })
]) satisfies z.ZodType<GameEntry>

/** Presented on connect, carried in the WebSocket subprotocol header. */
export interface Ticket {
  v: typeof PROTOCOL_VERSION
  /** Per-player secret used to reclaim the same seat after a reconnect. */
  token: PlayerToken
  name: PlayerName
  entry: GameEntry
}
const TicketSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  token: PlayerTokenSchema,
  name: PlayerNameSchema,
  entry: GameEntrySchema
}) satisfies z.ZodType<Ticket>

// ---- client -> server ------------------------------------------------------

const RenameSchema = z.object({ name: PlayerNameSchema })
/** Host removes a player from the game. */
export const KickSchema = z.object({ playerId: PlayerIdSchema })

/** Round lengths the host may pick. */
export const ROUND_LENGTHS: readonly Ms[] = [10_000, 20_000, 30_000, 45_000, 60_000, 90_000, 120_000]
const MIN_ROUNDS = 1
export const MAX_ROUNDS = 15
/** Players in one game, one per player colour. */
export const MAX_PLAYERS = 16

/** Spectators in one game, on top of the players: they watch every round but do not play. */
export const MAX_SPECTATORS = 8

/**
 * How long a dropped player's seat is held (a refresh is the common case),
 * and how long an empty lobby stays open. Mid-game seats are held for good.
 */
export const SEAT_GRACE: Ms = 30_000
/** How long an empty game stays open mid-game, so a dropped network can come back. */
export const EMPTY_GAME_GRACE: Ms = 5 * 60_000
/** How long an empty game stays open on its final results, for one more look. */
export const EMPTY_RESULTS_GRACE: Ms = 2 * 60_000

/** How many rounds of each type a game asks; the rounds are their total, in a shuffled order. */
export type QuestionMix = Record<QuestionType, number>

/** Types an even mix (the default game) leaves out. */
const EXTRA_TYPES: readonly QuestionType[] = [QuestionType.FEATURE, QuestionType.STATE]

export const mixTotal = (mix: QuestionMix): number => QUESTION_TYPES.reduce((s, t) => s + mix[t], 0)

/** A mix of only these counts, the other types none. */
export function mixOf(counts: Partial<QuestionMix>): QuestionMix {
  return Object.fromEntries(QUESTION_TYPES.map((t) => [t, counts[t] ?? 0])) as QuestionMix
}

/**
 * An even mix of `rounds`: the same of each type but the extras, the rest one
 * each to the first types. The default game is 8 rounds, 2 of each.
 */
export function evenMix(rounds: number): QuestionMix {
  const types = QUESTION_TYPES.filter((t) => !EXTRA_TYPES.includes(t))
  const each = Math.floor(rounds / types.length)
  const rest = rounds % types.length
  return mixOf(Object.fromEntries(types.map((t, i) => [t, each + (i < rest ? 1 : 0)])))
}

const roundCount = z.number().int().min(0).max(MAX_ROUNDS)
export const MixSchema = z
  .record(z.enum(QuestionType), roundCount)
  .refine((m) => mixTotal(m) >= MIN_ROUNDS && mixTotal(m) <= MAX_ROUNDS, "a game has 1 to 15 rounds")

/**
 * How much of the map shows while guessing, least first. The reveal always
 * shows everything; place names never show while guessing.
 */
export enum MapDetail {
  MINIMAL = "MINIMAL",
  WATER = "WATER",
  PHYSICAL = "PHYSICAL",
  POLITICAL = "POLITICAL"
}

export const MAP_DETAILS: readonly { id: MapDetail; label: string; detail: string }[] = [
  { id: MapDetail.MINIMAL, label: "Minimal", detail: "Coastlines only" },
  { id: MapDetail.WATER, label: "Water", detail: "Adds rivers and lakes" },
  { id: MapDetail.PHYSICAL, label: "Physical", detail: "Adds mountains, forests, ice and colour" },
  { id: MapDetail.POLITICAL, label: "Political", detail: "Adds country borders" }
]
export const MapDetailSchema = z.enum(MapDetail)

/** Whether the map draws lakes while guessing: lake rounds are asked only when it does. */
export const showsLakes = (detail: MapDetail): boolean => detail !== MapDetail.MINIMAL

/** Host changes to the game settings while in the lobby. */
export const ConfigureSchema = z.object({
  roundLength: z
    .number()
    .int()
    .refine((v) => ROUND_LENGTHS.includes(v), "unsupported round length")
    .optional(),
  mix: MixSchema.optional(),
  mapDetail: MapDetailSchema.optional(),
  hints: z.number().int().min(0).max(MAX_HINTS).optional()
})
export type ConfigurePatch = z.infer<typeof ConfigureSchema>

/** The JSON messages. Paint goes on the paint topic in binary (see paint-wire.ts); pings, empty, on the ping topic. */
export const ClientMessageSchemas = {
  lock: z.object({}),
  unlock: z.object({}),
  ready: z.object({}),
  configure: ConfigureSchema,
  start: z.object({}),
  next: z.object({}),
  again: z.object({}),
  rename: RenameSchema,
  kick: KickSchema,
  makeHost: KickSchema,
  leave: z.object({}),
  /** In the lobby: watch instead of play, or take a player's seat. */
  setRole: z.object({ watch: z.boolean() }),
  end: z.object({}),
  /** Use one of the game's hints on this round. */
  hint: z.object({ axis: HintAxisSchema })
} as const
export type ClientTopic = keyof typeof ClientMessageSchemas
/** Each JSON topic's body, as its schema parses it. */
export type ClientMessages = { [K in ClientTopic]: z.infer<(typeof ClientMessageSchemas)[K]> }
type ClientBody<K extends ClientTopic> = z.input<(typeof ClientMessageSchemas)[K]>
/** A topic and a body its schema accepts, which may be left out when an empty body will do. */
export type ClientSend<K extends ClientTopic> =
  Record<string, never> extends ClientBody<K> ? [topic: K, body?: ClientBody<K>] : [topic: K, body: ClientBody<K>]

// ---- server -> client ------------------------------------------------------

export const ServerTopics = {
  state: "state",
  /** A round's RoundReveal, once per connection, before the first state that shows it. */
  reveal: "reveal",
  /** Your own paint, in binary, when you join mid-round: a refresh gets back what was painted. */
  paint: "paint",
  error: "error",
  /** The answer to a ping, so a client can tell a live connection from one that died without closing. */
  pong: "pong"
} as const

export enum Phase {
  LOBBY = "LOBBY",
  GUESSING = "GUESSING",
  REVEAL = "REVEAL",
  RESULTS = "RESULTS"
}

export interface GameConfig {
  roundLength: Ms
  /** How many rounds of each kind of question; their total (mixTotal) is the game's length. */
  mix: QuestionMix
  /** How much of the map shows while guessing (one of MAP_DETAILS). */
  mapDetail: MapDetail
  kernelId: KernelId
  /** Hints each player may use in the game, one per round at most. */
  hints: number
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
interface PassedGuess {
  type: RoundGuessType.PASSED
}

interface PaintedGuess {
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

/** What a view tells you about yourself, whatever the phase. */
export interface YouView {
  /** Absent in a view of no player. */
  id?: PlayerId
  isHost: boolean
  /** Not playing the round under way: watching, or joined mid-round and playing from the next. */
  sittingOut: boolean
  /** True for a spectator, who watches the whole game (see PlayerView.watching). */
  watching: boolean
  locked: boolean
  hintsLeft: number
  /** While you host: who would take over if you left. */
  nextHost?: PlayerId
}

/** You, while a round is played or revealed. */
interface RoundYouView extends YouView {
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

/** Of the reveal, what the state topic carries: only what changes while it shows. */
type RevealProgress = Pick<RevealView, "index" | "ready">

/** A guessing view as the state topic carries it: your paint goes on its own topic. */
interface GuessingStateMessage extends Omit<GuessingGameView, "you"> {
  you: RoundYouView
}

/** A reveal as the state topic carries it: the bulk of it goes once, on the reveal topic. */
interface RevealStateMessage extends Omit<RevealGameView, "reveal"> {
  reveal: RevealProgress
}

export type StateMessage = LobbyGameView | GuessingStateMessage | RevealStateMessage | ResultsGameView

export function stateMessage(view: GameView): StateMessage {
  switch (view.phase) {
    case Phase.GUESSING: {
      const { paint: _paint, ...you } = view.you
      return { ...view, you }
    }
    case Phase.REVEAL:
      return { ...view, reveal: { index: view.reveal.index, ready: view.reveal.ready } }
    case Phase.LOBBY:
    case Phase.RESULTS:
      return view
  }
}

/**
 * The view a state message stands for, given the reveal and paint received
 * since connecting; undefined for a reveal's state that came before its
 * reveal, which the server never sends.
 */
export function viewFrom(
  state: StateMessage,
  reveal: RoundReveal | undefined,
  paint: PaintSubmission | undefined
): GameView | undefined {
  switch (state.phase) {
    case Phase.GUESSING:
      return paint ? { ...state, you: { ...state.you, paint } } : state
    case Phase.REVEAL:
      return reveal?.index === state.reveal.index
        ? { ...state, reveal: { ...reveal, ready: state.reveal.ready } }
        : undefined
    case Phase.LOBBY:
    case Phase.RESULTS:
      return state
  }
}

/** A RoundReveal as the reveal topic carries it: JSON, with each paint as base64 binary. */
export type RevealMessage = Omit<RoundReveal, "results"> & {
  results: (Omit<RoundResultView, "guess"> & {
    guess: PassedGuess | (Omit<PaintedGuess, "paint"> & { paint: string })
  })[]
}

export function revealMessage(reveal: RoundReveal): RevealMessage {
  return {
    ...reveal,
    results: reveal.results.map(({ guess, ...result }) => ({
      ...result,
      guess: guess.type === RoundGuessType.PAINTED ? { ...guess, paint: paintToBase64(guess.paint) } : guess
    }))
  }
}

export function revealFrom(message: RevealMessage): RoundReveal {
  return {
    ...message,
    results: message.results.map(({ guess, ...result }) => {
      if (guess.type === RoundGuessType.PASSED) return { ...result, guess }
      const paint = paintFromBase64(guess.paint)
      return { ...result, guess: paint ? { ...guess, paint } : { type: RoundGuessType.PASSED } }
    })
  }
}

export function encodeMessage(value: unknown): string {
  return JSON.stringify(value)
}

export function decodeMessage(payload: Uint8Array | string): unknown {
  const text = typeof payload === "string" ? payload : new TextDecoder().decode(payload)
  return JSON.parse(text) as unknown
}

// ---- tickets ---------------------------------------------------------------

/**
 * Tickets travel in the Sec-WebSocket-Protocol header, which forbids most
 * punctuation, so they are base64url-encoded JSON. TextEncoder and btoa are
 * available in browsers and Node 22 alike.
 */
export function encodeTicket(ticket: Ticket): string {
  const bytes = new TextEncoder().encode(JSON.stringify(ticket))
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** The ticket, or OUTDATED for one from a client of another protocol version, or undefined for one not a ticket at all. */
export function decodeTicket(raw: string): Ticket | CloseReason.OUTDATED | undefined {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/")
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    const result = TicketSchema.safeParse(parsed)
    if (result.success) return result.data
    const versioned = z.object({ v: z.number() }).safeParse(parsed)
    return versioned.success && versioned.data.v !== PROTOCOL_VERSION ? CloseReason.OUTDATED : undefined
  } catch {
    return undefined
  }
}
