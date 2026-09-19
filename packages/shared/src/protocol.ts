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

/** Hard cap on cells per submission; the client's brush cap keeps it far lower. */
export const MAX_PAINT_CELLS = 40_000;

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
});
export type Ticket = z.infer<typeof TicketSchema>;

// ---- client -> server ------------------------------------------------------

export const ClientTopics = {
  paint: "paint",
  lock: "lock",
  start: "start",
  next: "next",
  again: "again",
} as const;

export const ClientMessageSchemas = {
  paint: PaintSubmissionSchema,
  lock: z.object({}),
  start: z.object({}),
  next: z.object({}),
  again: z.object({}),
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
  revealMs: number;
  kernelId: string;
}

export interface PlayerView {
  id: string;
  name: string;
  /** Index into the client palette. */
  colour: number;
  connected: boolean;
  isHost: boolean;
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
  results: RoundResultView[];
  /** Server epoch ms when the round auto-advances. */
  autoAdvanceAt: number;
}

export interface FinalStanding {
  playerId: string;
  total: number;
  rounds: number[];
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
    locked: boolean;
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
