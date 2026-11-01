import { z } from "zod"
import { PointsSchema, type Points } from "../units.ts"

export enum GuessType {
  BULLSEYE = "BULLSEYE",
  CLOSE = "CLOSE",
  NEAR_MISS = "NEAR_MISS",
  FAR_MISS = "FAR_MISS",
  WIDE = "WIDE",
  HEDGE = "HEDGE",
  SCATTERED = "SCATTERED",
  WHOLE = "WHOLE",
  PART = "PART",
  SPILL = "SPILL",
  CENTRE = "CENTRE",
  NEIGHBOUR = "NEIGHBOUR"
}

interface VerdictBase {
  /** REVIEW_VERSION when given; absent on the first version's. */
  version?: number
  set: number
  index: number
  note?: string
  /** When, as an ISO date. */
  at: string
}

/**
 * A playtester's verdict, as the review exports it (one JSON object a line).
 * Each carries its cases as encodeCase writes them, with the score shown,
 * so it can be re-scored as the scoring changes.
 */
export type ScoreVerdict =
  | (VerdictBase & {
      guess: GuessType
      /** Much too low (-2) to much too high (2). */
      verdict: -2 | -1 | 0 | 1 | 2
      /** What they think it should have scored. */
      shouldBe?: Points
      case: string
    })
  | (VerdictBase & {
      pair: true
      guesses: [GuessType, GuessType]
      /** A clearly deserves more (-2) to B clearly does (2). */
      prefer: -2 | -1 | 0 | 1 | 2
      cases: [string, string]
    })

const Scale = z.union([z.literal(-2), z.literal(-1), z.literal(0), z.literal(1), z.literal(2)])
// Verdicts given before the guesses were an enum name them in lower case.
const Guess = z.preprocess(
  (value) => (typeof value === "string" ? value.toUpperCase().replaceAll("-", "_") : value),
  z.enum(GuessType)
)
const verdictBase = {
  version: z.number().optional(),
  set: z.number(),
  index: z.number(),
  note: z.string().optional(),
  at: z.string()
}

export const ScoreVerdictSchema: z.ZodType<ScoreVerdict> = z.union([
  z.object({ ...verdictBase, guess: Guess, verdict: Scale, shouldBe: PointsSchema.optional(), case: z.string() }),
  z.object({
    ...verdictBase,
    pair: z.literal(true),
    guesses: z.tuple([Guess, Guess]),
    prefer: Scale,
    cases: z.tuple([z.string(), z.string()])
  })
])
