/**
 * Wire protocol between client and game server. Every message is JSON text on
 * a Rivalis topic, except paint, which is binary (see paint-wire.ts). Schemas
 * validate inbound data on the server; the inferred types are shared with the
 * client.
 */
import { z } from "zod"
import type { Award } from "./awards.ts"
import type { LatLon } from "./geo.ts"
import type { Topic } from "./questions.ts"
import type { PlayerColour } from "./colours.ts"
import type { H3Cell, H3Res } from "./h3.ts"
import { paintFromBase64, paintToBase64 } from "./paint-wire.ts"
import { HintAxisSchema, MAX_HINTS, type HintAxis, type HintBand } from "./hints.ts"
import type { KernelId } from "./scoring.ts"
import {
  PlayerIdSchema,
  PlayerNameSchema,
  PlayerTokenSchema,
  RoomCodeSchema,
  type FlagCode,
  type PlayerId,
  type PlayerName,
  type RegionId,
  type RoomCode
} from "./ids.ts"

export const PROTOCOL_VERSION = 3

/** Sparse paint: H3 cell index -> intensity. Plus the uniform world floor. */
export interface PaintSubmission {
  cells: Record<H3Cell, number>
  floor: number
}

/** Ticket presented on connect, carried in the WebSocket subprotocol header. */
export const TicketSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  /** Per-player secret used to reclaim the same seat after a reconnect. */
  token: PlayerTokenSchema,
  name: PlayerNameSchema,
  /** Join an existing game by code, or omit with `create: true` to host one; both host one under that code. */
  code: RoomCodeSchema.optional(),
  create: z.boolean().optional(),
  /** Join to watch rather than play. A full game seats a would-be player as a spectator anyway. */
  watch: z.boolean().optional()
})
export type Ticket = z.infer<typeof TicketSchema>

// ---- client -> server ------------------------------------------------------

export const ClientTopics = {
  paint: "paint",
  lock: "lock",
  unlock: "unlock",
  ready: "ready",
  configure: "configure",
  start: "start",
  next: "next",
  again: "again",
  rename: "rename",
  kick: "kick",
  end: "end",
  hint: "hint"
} as const

export const RenameSchema = z.object({ name: PlayerNameSchema })
/** Host removes a player from the game. */
export const KickSchema = z.object({ playerId: PlayerIdSchema })

/** Round lengths the host may pick, ms. */
export const ROUND_LENGTHS_MS = [10_000, 20_000, 30_000, 45_000, 60_000, 90_000, 120_000] as const
export const MIN_ROUNDS = 1
export const MAX_ROUNDS = 15
/** Players in one game, one per player colour. */
export const MAX_PLAYERS = 16

/** Spectators in one game, on top of the players: they watch every round but do not play. */
export const MAX_SPECTATORS = 8

/**
 * How long a dropped player's seat is held (a refresh is the common case),
 * and how long an empty game stays open, ms. Mid-game seats are held for good.
 */
export const SEAT_GRACE_MS = 30_000

/**
 * The kinds of question a game can ask, in the order the host sees them. An
 * even mix (the default game) leaves out those marked extra.
 */
export const QUESTION_TYPES = [
  { id: "landmarks", label: "Landmarks", detail: "Photos of famous places" },
  { id: "places", label: "Place names", detail: "Cities, capitals and small countries" },
  { id: "countries", label: "Whole countries", detail: "Paint a country's shape" },
  { id: "flags", label: "Flags", detail: "Find the country from its flag" },
  { id: "features", label: "Islands, lakes & seas", detail: "Paint a big island, lake or sea", extra: true },
  { id: "states", label: "US states", detail: "Paint a state's shape", extra: true }
] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]["id"]

/** How many rounds of each kind a game asks; the rounds are their total, in a shuffled order. */
export type QuestionMix = Record<QuestionType, number>

export const mixTotal = (mix: QuestionMix): number => QUESTION_TYPES.reduce((s, t) => s + mix[t.id], 0)

/**
 * An even mix of `rounds`: the same of each kind but the extras, the rest one
 * each to the first kinds. The default game is 8 rounds, 2 of each.
 */
export function evenMix(rounds: number): QuestionMix {
  const kinds = QUESTION_TYPES.filter((t) => !("extra" in t))
  const each = Math.floor(rounds / kinds.length)
  const rest = rounds % kinds.length
  return Object.fromEntries(
    QUESTION_TYPES.map((t) => {
      const i = kinds.findIndex((k) => k.id === t.id)
      return [t.id, i < 0 ? 0 : each + (i < rest ? 1 : 0)]
    })
  ) as QuestionMix
}

const roundCount = z.number().int().min(0).max(MAX_ROUNDS)
export const MixSchema = z
  .object({
    landmarks: roundCount,
    places: roundCount,
    countries: roundCount,
    flags: roundCount,
    // A setup saved before these kinds existed has none of them.
    features: roundCount.default(0),
    states: roundCount.default(0)
  })
  .refine((m) => mixTotal(m) >= MIN_ROUNDS && mixTotal(m) <= MAX_ROUNDS, "a game has 1 to 15 rounds")

/**
 * How much of the map shows while guessing, least first. The reveal always
 * shows everything; place names never show while guessing.
 */
export const MAP_DETAILS = [
  { id: "minimal", label: "Minimal", detail: "Coastlines only" },
  { id: "water", label: "Water", detail: "Adds rivers and lakes" },
  { id: "physical", label: "Physical", detail: "Adds mountains, forests, ice and colour" },
  { id: "political", label: "Political", detail: "Adds country borders" }
] as const
export type MapDetail = (typeof MAP_DETAILS)[number]["id"]
export const MapDetailSchema = z.enum(MAP_DETAILS.map((d) => d.id) as [MapDetail, ...MapDetail[]])

/** Whether the map draws lakes while guessing: lake rounds are asked only when it does. */
export const showsLakes = (detail: MapDetail): boolean => detail !== "minimal"

/** Host changes to the game settings while in the lobby. */
export const ConfigureSchema = z.object({
  roundMs: z
    .number()
    .int()
    .refine((v) => (ROUND_LENGTHS_MS as readonly number[]).includes(v), "unsupported round length")
    .optional(),
  mix: MixSchema.optional(),
  mapDetail: MapDetailSchema.optional(),
  hints: z.number().int().min(0).max(MAX_HINTS).optional()
})
export type ConfigurePatch = z.infer<typeof ConfigureSchema>

/** The JSON messages. Paint goes on the paint topic in binary (see paint-wire.ts). */
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

// ---- server -> client ------------------------------------------------------

export const ServerTopics = {
  state: "state",
  /** A round's RoundReveal, once per connection, before the first state that shows it. */
  reveal: "reveal",
  /** Your own paint, in binary, when you join mid-round: a refresh gets back what was painted. */
  paint: "paint",
  error: "error"
} as const

export type Phase = "lobby" | "guessing" | "reveal" | "results"

export interface GameConfig {
  /** The mix's total: set from it, never on its own. */
  rounds: number
  roundMs: number
  /** How many rounds of each kind of question. */
  mix: QuestionMix
  /** How much of the map shows while guessing (one of MAP_DETAILS). */
  mapDetail: MapDetail
  kernelId: KernelId
  /** Hints each player may use in the game, one per round at most. */
  hints: number
}

export interface PlayerView {
  id: PlayerId
  name: PlayerName
  /** Absent for a spectator, who has no colour. */
  colour?: PlayerColour
  /** Watching rather than playing: no paint, no score, and never waited on. */
  watching: boolean
  connected: boolean
  isHost: boolean
  /** Has frozen their guess this round. */
  locked: boolean
  /** Total so far. */
  score: number
  /** 1-based rank by score, ties share a rank. */
  rank: number
  /** Rank at the end of the previous round, for change arrows. */
  previousRank?: number
}

export interface QuestionView {
  prompt: string
  image?: string
  toleranceKm: number
  /** Set for a country question ("Paint the whole of Mexico"): its id in regions.json, for the outline. */
  regionId?: RegionId
  /** A flag round: the flag's ISO code, shown in place of a name. */
  flag?: FlagCode
  /** What an "Islands, lakes & seas" or "US states" round asks for. */
  topic?: Topic
}

export interface RoundView {
  index: number
  total: number
  question: QuestionView
  /** Server epoch ms when guessing ends. */
  deadline: number
}

export interface RoundResultView {
  playerId: PlayerId
  score: number
  /** The point rule's parts; 0 in a country round, which reports `region` instead. */
  A: number
  B: number
  /** A country round's parts (see regions.ts), for a paint that was scored. */
  region?: { shape: number; nearness: number; coverage: number; precision: number }
  /** Absent when the player made no guess. */
  paint?: PaintSubmission
  /** H3 resolution the paint was made at, for rendering. */
  res: H3Res
  /** The hint this player used on the round. */
  hint?: HintAxis
}

export interface RevealView {
  index: number
  total: number
  question: QuestionView
  answer: LatLon
  label: string
  /** Wikipedia article title for the answer, when known. */
  wiki?: string
  /** A photo of the answer, on a round that showed none while guessing (see photos.ts). */
  photo?: string
  results: RoundResultView[]
  /** Ids of players who have pressed Ready. The round advances when everyone connected has. */
  ready: PlayerId[]
}

/** The pictures a question shows, so a client can load the next round's before it starts. */
export interface QuestionPictures {
  image?: string
  flag?: FlagCode
  /** Shown at the reveal (see photos.ts). */
  revealPhoto?: string
}

/** A round of a finished game, for the final results: what it asked about. */
export interface PlayedRound extends QuestionPictures {
  label: string
  type: QuestionType
  /** Which of the islands, lakes and seas, for a features round. */
  topic?: Topic
  /** The outline painted, where the round asked for a shape by name. */
  regionId?: RegionId
}

export interface FinalStanding {
  playerId: PlayerId
  total: number
  /** Per round played; no score where the player sat out (joined late). Objects, since JSON turns undefined in an array into null. */
  rounds: { score?: number }[]
}

export interface GameView {
  code: RoomCode
  phase: Phase
  config: GameConfig
  serverTime: number
  you: {
    /** Absent in a view of no player. */
    id?: PlayerId
    isHost: boolean
    /** True when this player joined mid-round and sits this one out. */
    spectating: boolean
    /** True for a spectator, who watches the whole game (see PlayerView.watching). */
    watching: boolean
    locked: boolean
    /** Your own current submission while guessing, so a reconnect can restore it. Never anyone else's. */
    paint?: PaintSubmission
    /** Your hint on this round, while guessing and at its reveal. */
    hint?: HintBand
    hintsLeft: number
  }
  players: PlayerView[]
  round?: RoundView
  reveal?: RevealView
  results?: FinalStanding[]
  /** The rounds played, in order, on the final results. */
  playedRounds?: PlayedRound[]
  /** Prizes and booby prizes, on the final results. */
  awards?: Award[]
  /** The next round's pictures, from the lobby on, so they are loaded before it starts. */
  upcoming?: QuestionPictures
}

/** What a reveal shows that stays the same while it shows: the bulk of it, every player's paint. */
export type RoundReveal = Omit<RevealView, "ready">

/**
 * A view as the state topic carries it: of the reveal, only what changes
 * while it shows, and none of your paint, which goes on its own topic.
 */
export type StateMessage = Omit<GameView, "reveal" | "you"> & {
  you: Omit<GameView["you"], "paint">
  reveal?: Pick<RevealView, "index" | "ready">
}

export function stateMessage({ reveal, you, ...rest }: GameView): StateMessage {
  const { paint: _paint, ...yours } = you
  return { ...rest, you: yours, ...(reveal ? { reveal: { index: reveal.index, ready: reveal.ready } } : {}) }
}

/**
 * The view a state message stands for, given the reveal and paint received
 * since connecting: no reveal unless it is that round's, and the paint only
 * while guessing.
 */
export function viewFrom(
  state: StateMessage,
  reveal: RoundReveal | undefined,
  paint: PaintSubmission | undefined
): GameView {
  const { reveal: progress, you, ...rest } = state
  const view: GameView = { ...rest, you: state.phase === "guessing" && paint ? { ...you, paint } : you }
  if (progress && reveal?.index === progress.index) view.reveal = { ...reveal, ready: progress.ready }
  return view
}

/** A RoundReveal as the reveal topic carries it: JSON, with each paint as base64 binary. */
export type RevealMessage = Omit<RoundReveal, "results"> & {
  results: (Omit<RoundResultView, "paint"> & { paint?: string })[]
}

export function revealMessage(reveal: RoundReveal): RevealMessage {
  return {
    ...reveal,
    results: reveal.results.map(({ paint, ...result }) => (paint ? { ...result, paint: paintToBase64(paint) } : result))
  }
}

export function revealFrom(message: RevealMessage): RoundReveal {
  return {
    ...message,
    results: message.results.map(({ paint, ...result }) => {
      const decoded = paint === undefined ? undefined : paintFromBase64(paint)
      return decoded ? { ...result, paint: decoded } : result
    })
  }
}

export interface ServerError {
  message: string
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

/** Parses and validates a ticket; returns undefined for anything malformed. */
export function decodeTicket(raw: string): Ticket | undefined {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/")
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    const result = TicketSchema.safeParse(parsed)
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}
