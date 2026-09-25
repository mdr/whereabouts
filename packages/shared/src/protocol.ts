/**
 * Wire protocol between client and game server. Every message is JSON text on
 * a Rivalis topic. Schemas validate inbound data on the server; the inferred
 * types are shared with the client.
 */
import { z } from "zod";
import type { LatLon } from "./geo.ts";

export const PROTOCOL_VERSION = 1;

/** Sparse paint: H3 cell index -> intensity. Plus the uniform world floor. */
export const PaintSubmissionSchema = z.object({
  cells: z.record(z.string().regex(/^[0-9a-f]{15}$/), z.number().positive().finite()),
  floor: z.number().min(0).max(1),
});
export type PaintSubmission = z.infer<typeof PaintSubmissionSchema>;

/** Hard cap on cells per submission; clients compact to PAINT_CELL_BUDGET before sending. */
export const MAX_PAINT_CELLS = 12_000;

/** Ticket presented on connect, carried in the WebSocket subprotocol header. */
export const TicketSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  /** Per-player secret used to reclaim the same seat after a reconnect. */
  token: z.string().min(16).max(64),
  name: z.string().trim().min(1).max(20),
  /** Join an existing game by code, or omit with `create: true` to host one. */
  code: z
    .string()
    .regex(/^[A-Z0-9]{4,6}$/)
    .optional(),
  create: z.boolean().optional(),
  /** Join to watch rather than play. A full game seats a would-be player as a spectator anyway. */
  watch: z.boolean().optional(),
});
export type Ticket = z.infer<typeof TicketSchema>;

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
} as const;

export const RenameSchema = z.object({ name: z.string().trim().min(1).max(20) });
/** Host removes a player from the game. */
export const KickSchema = z.object({ playerId: z.string().min(1).max(20) });

/** Round lengths the host may pick, ms. */
export const ROUND_LENGTHS_MS = [30_000, 45_000, 60_000, 90_000, 120_000] as const;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 15;
/** Players in one game, one per player colour. */
export const MAX_PLAYERS = 16;

/** Spectators in one game, on top of the players: they watch every round but do not play. */
export const MAX_SPECTATORS = 8;

/**
 * How long a dropped player's seat is held (a refresh is the common case),
 * and how long an empty game stays open, ms. Mid-game seats are held for good.
 */
export const SEAT_GRACE_MS = 30_000;

/** Question mixes the host may pick: the share of photo questions, with a label. */
export const PHOTO_MIXES = [
  { share: 1, label: "Photos" },
  { share: 0.75, label: "Mostly photos" },
  { share: 0.5, label: "Even" },
  { share: 0.25, label: "Mostly names" },
  { share: 0, label: "Place names" },
] as const;

/**
 * How much of the map shows while guessing, least first. The reveal always
 * shows everything; place names never show while guessing.
 */
export const MAP_DETAILS = [
  { id: "minimal", label: "Minimal", detail: "Coastlines only" },
  { id: "water", label: "Water", detail: "Adds rivers and lakes" },
  { id: "physical", label: "Physical", detail: "Adds mountains, forests, ice and colour" },
  { id: "political", label: "Political", detail: "Adds country borders" },
] as const;
export type MapDetail = (typeof MAP_DETAILS)[number]["id"];

/** Host changes to the game settings while in the lobby. */
export const ConfigureSchema = z.object({
  rounds: z.number().int().min(MIN_ROUNDS).max(MAX_ROUNDS).optional(),
  roundMs: z
    .number()
    .int()
    .refine((v) => (ROUND_LENGTHS_MS as readonly number[]).includes(v), "unsupported round length")
    .optional(),
  photoShare: z
    .number()
    .refine((v) => PHOTO_MIXES.some((m) => m.share === v), "unsupported question mix")
    .optional(),
  mapDetail: z.enum(MAP_DETAILS.map((d) => d.id) as [MapDetail, ...MapDetail[]]).optional(),
});
export type ConfigurePatch = z.infer<typeof ConfigureSchema>;

export const ClientMessageSchemas = {
  paint: PaintSubmissionSchema,
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
} as const;

// ---- server -> client ------------------------------------------------------

export const ServerTopics = {
  state: "state",
  error: "error",
} as const;

export type Phase = "lobby" | "guessing" | "reveal" | "results";

export interface GameConfig {
  rounds: number;
  roundMs: number;
  /** Share of questions that are photos (one of PHOTO_MIXES); the rest name a place. */
  photoShare: number;
  /** How much of the map shows while guessing (one of MAP_DETAILS). */
  mapDetail: MapDetail;
  kernelId: string;
}

export interface PlayerView {
  id: string;
  name: string;
  /** Index into the client palette; -1 for a spectator, who has no colour. */
  colour: number;
  /** Watching rather than playing: no paint, no score, and never waited on. */
  watching: boolean;
  connected: boolean;
  isHost: boolean;
  /** Has frozen their guess this round. */
  locked: boolean;
  /** Total so far. */
  score: number;
  /** 1-based rank by score, ties share a rank. */
  rank: number;
  /** Rank at the end of the previous round, for change arrows. */
  previousRank: number | null;
}

export interface QuestionView {
  prompt: string;
  image?: string;
  toleranceKm: number;
}

export interface RoundView {
  index: number;
  total: number;
  question: QuestionView;
  /** Server epoch ms when guessing ends. */
  deadline: number;
}

export interface RoundResultView {
  playerId: string;
  score: number;
  A: number;
  B: number;
  /** Null when the player made no guess. */
  paint: PaintSubmission | null;
  /** H3 resolution the paint was made at, for rendering. */
  res: number;
}

export interface RevealView {
  index: number;
  total: number;
  question: QuestionView;
  answer: LatLon;
  label: string;
  /** Wikipedia article title for the answer, when known. */
  wiki?: string;
  results: RoundResultView[];
  /** Ids of players who have pressed Ready. The round advances when everyone connected has. */
  ready: string[];
}

export interface FinalStanding {
  playerId: string;
  total: number;
  /** Per round played; null where the player sat out (joined late). */
  rounds: (number | null)[];
}

export interface GameView {
  code: string;
  phase: Phase;
  config: GameConfig;
  serverTime: number;
  you: {
    id: string;
    isHost: boolean;
    /** True when this player joined mid-round and sits this one out. */
    spectating: boolean;
    /** True for a spectator, who watches the whole game (see PlayerView.watching). */
    watching: boolean;
    locked: boolean;
    /** Your own current submission while guessing, so a reconnect can restore it. Never anyone else's. */
    paint: PaintSubmission | null;
  };
  players: PlayerView[];
  round: RoundView | null;
  reveal: RevealView | null;
  results: FinalStanding[] | null;
}

export interface ServerError {
  message: string;
}

export function encodeMessage(value: unknown): string {
  return JSON.stringify(value);
}

export function decodeMessage(payload: Uint8Array | string): unknown {
  const text = typeof payload === "string" ? payload : new TextDecoder().decode(payload);
  return JSON.parse(text) as unknown;
}

// ---- tickets ---------------------------------------------------------------

/**
 * Tickets travel in the Sec-WebSocket-Protocol header, which forbids most
 * punctuation, so they are base64url-encoded JSON. TextEncoder and btoa are
 * available in browsers and Node 22 alike.
 */
export function encodeTicket(ticket: Ticket): string {
  const bytes = new TextEncoder().encode(JSON.stringify(ticket));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Parses and validates a ticket; returns null for anything malformed. */
export function decodeTicket(raw: string): Ticket | null {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const result = TicketSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
