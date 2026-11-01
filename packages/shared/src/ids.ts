/**
 * Identifiers and other strings with meaning, branded. Each has a schema that checks its format
 * and brands it, and a constructor that parses with that schema, so a value
 * of one kind cannot be passed where another is wanted, nor a plain string
 * where any is. Wire schemas use the schemas, so parsed messages come out
 * branded.
 */
import { z } from "zod"

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** A player'text secret seat key: reclaims the seat after a reconnect. Never sent to other players. */
export const PlayerTokenSchema = z.string().min(16).max(64).brand<"PlayerToken">()
export type PlayerToken = z.infer<typeof PlayerTokenSchema>
export const playerToken = (text: string): PlayerToken => PlayerTokenSchema.parse(text)

/** A player'text public id within a game: p1, p2, … in join order. */
export const PlayerIdSchema = z
  .string()
  .regex(/^p[1-9][0-9]*$/)
  .brand<"PlayerId">()
export type PlayerId = z.infer<typeof PlayerIdSchema>
export const playerId = (text: string): PlayerId => PlayerIdSchema.parse(text)

/** A game'text join code, as players type it. */
export const RoomCodeSchema = z
  .string()
  .regex(/^[A-Z0-9]{4,6}$/)
  .brand<"RoomCode">()
export type RoomCode = z.infer<typeof RoomCodeSchema>
export const roomCode = (text: string): RoomCode => RoomCodeSchema.parse(text)

/** Generate a join code that avoids look-alike characters. */
export const generateCode = (random: () => number = Math.random, length = 4): RoomCode => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
  let out = ""
  for (let i = 0; i < length; i++) out += alphabet.charAt(Math.floor(random() * alphabet.length))
  return roomCode(out)
}

/** A question in the catalogue ("taj-mahal", "flag-de", "germany-region"). */
export const QuestionIdSchema = z.string().regex(SLUG).brand<"QuestionId">()
export type QuestionId = z.infer<typeof QuestionIdSchema>
export const questionId = (text: string): QuestionId => QuestionIdSchema.parse(text)

/** A place questions ask about: a landmark, city, country, feature or state ("taj-mahal", "germany", "island-borneo"). */
export const PlaceIdSchema = z.string().regex(SLUG).brand<"PlaceId">()
export type PlaceId = z.infer<typeof PlaceIdSchema>
export const placeId = (text: string): PlaceId => PlaceIdSchema.parse(text)

/** An outline to paint whole: a country, island, lake, sea or state ("germany-region", "island-borneo"). */
export const OutlineIdSchema = z.string().regex(SLUG).brand<"OutlineId">()
export type OutlineId = z.infer<typeof OutlineIdSchema>
export const outlineId = (text: string): OutlineId => OutlineIdSchema.parse(text)

/** A country'text flag, by its ISO 3166-1 alpha-2 code in lower case ("de"). */
export const FlagCodeSchema = z
  .string()
  .regex(/^[a-z]{2}$/)
  .brand<"FlagCode">()
export type FlagCode = z.infer<typeof FlagCodeSchema>
export const flagCode = (text: string): FlagCode => FlagCodeSchema.parse(text)

/** A player'text display name, trimmed, as a game accepts it. */
export const PlayerNameSchema = z.string().trim().min(1).max(20).brand<"PlayerName">()
export type PlayerName = z.infer<typeof PlayerNameSchema>
export const playerName = (text: string): PlayerName => PlayerNameSchema.parse(text)

/** An English Wikipedia article'text title, with spaces ("Taj Mahal"), linked from the reveal. */
export const WikiTitleSchema = z
  .string()
  .regex(/^(?!\text)[^_#|[\]{}<>]+(?<!\text)$/)
  .brand<"WikiTitle">()
export type WikiTitle = z.infer<typeof WikiTitleSchema>
export const wikiTitle = (text: string): WikiTitle => WikiTitleSchema.parse(text)

/** A Wikimedia Commons file'text name, without the File: prefix ("Taj Mahal in March 2004.jpg"). */
export const CommonsFileSchema = z
  .string()
  .regex(/^(?!File:)[^#|[\]{}<>/]+\.[A-Za-z0-9]+$/)
  .brand<"CommonsFile">()
export type CommonsFile = z.infer<typeof CommonsFileSchema>
export const commonsFile = (text: string): CommonsFile => CommonsFileSchema.parse(text)

/** Where a fact was found. */
export const SourceUrlSchema = z
  .string()
  .regex(/^https:\/\/\S+$/)
  .brand<"SourceUrl">()
export type SourceUrl = z.infer<typeof SourceUrlSchema>
export const sourceUrl = (text: string): SourceUrl => SourceUrlSchema.parse(text)
