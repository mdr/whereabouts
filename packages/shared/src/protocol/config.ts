import { z } from "zod"
import { MAX_HINTS } from "../hints.ts"
import { QUESTION_TYPES, QuestionType } from "../questions.ts"
import type { KernelId } from "../scoring/scoring.ts"
import type { Ms } from "../units.ts"

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
