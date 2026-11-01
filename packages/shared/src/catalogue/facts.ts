/**
 * A line of interest for the reveal: what makes the answer notable, a piece
 * of trivia, or on a flag round something about the flag. facts.json holds
 * three or four about each place, and about each country's flag, by place,
 * each researched and then checked against its source and a second one.
 */
import { z } from "zod"
import { PlaceIdSchema, SourceUrlSchema, type PlaceId, type SourceUrl } from "../ids.ts"
import { QuestionType } from "../questions.ts"

export enum FactType {
  FAME = "FAME",
  TRIVIA = "TRIVIA",
  FLAG = "FLAG"
}

export interface Fact {
  type: FactType
  text: string
  source: SourceUrl
}

/** A place's facts: about it, and about its flag. */
export interface PlaceFacts {
  about?: Fact[]
  flag?: Fact[]
}

export type Facts = Partial<Record<PlaceId, PlaceFacts>>

/** One place's facts, as facts.json holds them. */
const FactListSchema = z.array(z.strictObject({ type: z.enum(FactType), text: z.string(), source: SourceUrlSchema }))
export const PlaceFactsSchema: z.ZodType<PlaceFacts> = z.strictObject({
  about: FactListSchema.optional(),
  flag: FactListSchema.optional()
})

/** facts.json as it is read. */
export const FactsSchema: z.ZodType<Facts> = z.partialRecord(PlaceIdSchema, PlaceFactsSchema)

/** The facts a round's reveal picks from: a flag round's are about the flag. */
export const factsFor = (facts: PlaceFacts | undefined, type: QuestionType): Fact[] | undefined =>
  type === QuestionType.FLAG ? facts?.flag : facts?.about

/**
 * One of an answer's facts. The same `seed` and `round` give the same fact,
 * so every player in a game sees the same one. Rounds alternate between
 * what makes a place notable and trivia; a flag round tells of its flag.
 */
export function pickFact(facts: readonly Fact[] | undefined, seed: string, round: number): Fact | undefined {
  if (!facts?.length) return undefined
  const wanted = facts.some((fact) => fact.type === FactType.FLAG)
    ? FactType.FLAG
    : round % 2 === 0
      ? FactType.FAME
      : FactType.TRIVIA
  const choice = facts.filter((fact) => fact.type === wanted)
  const from = choice.length > 0 ? choice : facts
  return from[hash(`${seed} ${round}`) % from.length]
}

/** FNV-1a: a spread of picks from similar seeds. */
function hash(text: string): number {
  let value = 0x811c9dc5
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 0x01000193)
  return value >>> 0
}
