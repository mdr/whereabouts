/**
 * Identifiers as branded strings. Each has a schema that checks its format
 * and brands it, and a constructor that parses with that schema, so a value
 * of one kind cannot be passed where another is wanted, nor a plain string
 * where any is. Wire schemas use the schemas, so parsed messages come out
 * branded.
 */
import { z } from "zod"

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** A player's secret seat key: reclaims the seat after a reconnect. Never sent to other players. */
export const PlayerTokenSchema = z.string().min(16).max(64).brand<"PlayerToken">()
export type PlayerToken = z.infer<typeof PlayerTokenSchema>
export const playerToken = (s: string): PlayerToken => PlayerTokenSchema.parse(s)

/** A player's public id within a game: p1, p2, … in join order. */
export const PlayerIdSchema = z
  .string()
  .regex(/^p[1-9][0-9]*$/)
  .brand<"PlayerId">()
export type PlayerId = z.infer<typeof PlayerIdSchema>
export const playerId = (s: string): PlayerId => PlayerIdSchema.parse(s)

/** A game's join code, as players type it. */
export const RoomCodeSchema = z
  .string()
  .regex(/^[A-Z0-9]{4,6}$/)
  .brand<"RoomCode">()
export type RoomCode = z.infer<typeof RoomCodeSchema>
export const roomCode = (s: string): RoomCode => RoomCodeSchema.parse(s)

/** A question in the pool, a flag round or a feature asked as a point ("taj-mahal", "flag-de"). */
export const QuestionIdSchema = z.string().regex(SLUG).brand<"QuestionId">()
export type QuestionId = z.infer<typeof QuestionIdSchema>
export const questionId = (s: string): QuestionId => QuestionIdSchema.parse(s)

/** An outline to paint whole: a country, island, lake, sea or state ("germany-region", "island-borneo"). */
export const RegionIdSchema = z.string().regex(SLUG).brand<"RegionId">()
export type RegionId = z.infer<typeof RegionIdSchema>
export const regionId = (s: string): RegionId => RegionIdSchema.parse(s)

/** A country's flag, by its ISO 3166-1 alpha-2 code in lower case ("de"). */
export const FlagCodeSchema = z
  .string()
  .regex(/^[a-z]{2}$/)
  .brand<"FlagCode">()
export type FlagCode = z.infer<typeof FlagCodeSchema>
export const flagCode = (s: string): FlagCode => FlagCodeSchema.parse(s)
