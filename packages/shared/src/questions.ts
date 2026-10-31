/**
 * The questions a round can ask. Each has a type (its slot in a game's mix
 * and practice's choice), a clue (what the player sees) and an answer (what
 * they mark, and so how it is scored). catalogue.json holds them all; the
 * outlines of area answers are in outlines.json, by id.
 */
import { z } from "zod"
import type { LatLon } from "./geo.ts"
import {
  FlagCodeSchema,
  OutlineIdSchema,
  QuestionIdSchema,
  type FlagCode,
  type OutlineId,
  type QuestionId
} from "./ids.ts"

/** In the order the host and practice list them. */
export enum QuestionType {
  LANDMARK = "LANDMARK",
  PLACE = "PLACE",
  COUNTRY = "COUNTRY",
  FLAG = "FLAG",
  FEATURE = "FEATURE",
  STATE = "STATE"
}

export const QUESTION_TYPES: readonly QuestionType[] = Object.values(QuestionType)

export enum ClueType {
  PHOTO = "PHOTO",
  NAME = "NAME",
  FLAG = "FLAG"
}

export enum AnswerType {
  POINT = "POINT",
  AREA = "AREA"
}

export enum FeatureType {
  ISLAND = "ISLAND",
  LAKE = "LAKE",
  SEA = "SEA"
}

/** What an area answer is painted on: trimming drops paint off it. */
export enum Surface {
  LAND = "LAND",
  WATER = "WATER"
}

interface PhotoClue {
  type: ClueType.PHOTO
  /** Wikimedia Commons file name (without the File: prefix). */
  image: string
}

interface NameClue {
  type: ClueType.NAME
  /** The question as asked, naming the place: phrasings vary too much to build. */
  prompt: string
}

interface FlagClue {
  type: ClueType.FLAG
  flag: FlagCode
}

export type Clue = PhotoClue | NameClue | FlagClue

export interface PointAnswer {
  type: AnswerType.POINT
  at: LatLon
  toleranceKm: number
}

export interface AreaAnswer {
  type: AnswerType.AREA
  outline: OutlineId
  /** Area-weighted centre, for framing the map. */
  centre: LatLon
  /** A fifth of the area's equivalent radius, sqrt(area / pi). */
  toleranceKm: number
  surface: Surface
}

export type Answer = PointAnswer | AreaAnswer

export interface LandmarkQuestion {
  type: QuestionType.LANDMARK
  id: QuestionId
  /** Shown after the reveal. */
  label: string
  /** English Wikipedia article title, linked from the reveal. */
  wiki: string
  clue: PhotoClue
  answer: PointAnswer
}

export interface PlaceQuestion {
  type: QuestionType.PLACE
  id: QuestionId
  label: string
  wiki: string
  clue: NameClue
  answer: PointAnswer
}

interface CountryQuestion {
  type: QuestionType.COUNTRY
  id: QuestionId
  label: string
  wiki: string
  clue: NameClue
  answer: AreaAnswer
  /** Shown beside the country's name to help players learn it. */
  countryFlag?: FlagCode
}

/** A country found from its flag: painted whole when big enough to, else marked as a point. */
export interface FlagQuestion {
  type: QuestionType.FLAG
  id: QuestionId
  label: string
  /** The article on the flag. */
  wiki: string
  clue: FlagClue
  answer: PointAnswer | AreaAnswer
}

export interface FeatureQuestion {
  type: QuestionType.FEATURE
  id: QuestionId
  feature: FeatureType
  label: string
  wiki: string
  clue: NameClue
  answer: AreaAnswer
}

/** A US state: painted whole, or marked as a point when too small to paint. */
interface StateQuestion {
  type: QuestionType.STATE
  id: QuestionId
  label: string
  wiki: string
  clue: NameClue
  answer: PointAnswer | AreaAnswer
}

export type Question =
  | LandmarkQuestion
  | PlaceQuestion
  | CountryQuestion
  | FlagQuestion
  | FeatureQuestion
  | StateQuestion

/** Outlines by id: GeoJSON MultiPolygon coordinates, [lon, lat] rings, outer ring first. */
export type Outlines = ReadonlyMap<OutlineId, Outline>
export type Outline = number[][][][]

const LatLonSchema = z.object({ lat: z.number(), lon: z.number() })
const PointAnswerSchema = z.object({ type: z.literal(AnswerType.POINT), at: LatLonSchema, toleranceKm: z.number() })
const AreaAnswerSchema = z.object({
  type: z.literal(AnswerType.AREA),
  outline: OutlineIdSchema,
  centre: LatLonSchema,
  toleranceKm: z.number(),
  surface: z.enum(Surface)
})
const AnyAnswerSchema = z.discriminatedUnion("type", [PointAnswerSchema, AreaAnswerSchema])
const PhotoClueSchema = z.object({ type: z.literal(ClueType.PHOTO), image: z.string() })
const NameClueSchema = z.object({ type: z.literal(ClueType.NAME), prompt: z.string() })
const FlagClueSchema = z.object({ type: z.literal(ClueType.FLAG), flag: FlagCodeSchema })
const common = { id: QuestionIdSchema, label: z.string(), wiki: z.string() }

/** A question as catalogue.json holds it. */
export const QuestionSchema: z.ZodType<Question> = z.discriminatedUnion("type", [
  z.object({ ...common, type: z.literal(QuestionType.LANDMARK), clue: PhotoClueSchema, answer: PointAnswerSchema }),
  z.object({ ...common, type: z.literal(QuestionType.PLACE), clue: NameClueSchema, answer: PointAnswerSchema }),
  z.object({
    ...common,
    type: z.literal(QuestionType.COUNTRY),
    clue: NameClueSchema,
    answer: AreaAnswerSchema,
    countryFlag: FlagCodeSchema.optional()
  }),
  z.object({ ...common, type: z.literal(QuestionType.FLAG), clue: FlagClueSchema, answer: AnyAnswerSchema }),
  z.object({
    ...common,
    type: z.literal(QuestionType.FEATURE),
    feature: z.enum(FeatureType),
    clue: NameClueSchema,
    answer: AreaAnswerSchema
  }),
  z.object({ ...common, type: z.literal(QuestionType.STATE), clue: NameClueSchema, answer: AnyAnswerSchema })
])

export const PHOTO_PROMPT = "Where is this?"
export const FLAG_AREA_PROMPT = "Paint the whole of the country with this flag"
export const FLAG_POINT_PROMPT = "Where is the country with this flag?"

/** The question as the player reads it. */
export function promptOf({ clue, answer }: { clue: Clue; answer: { type: AnswerType } }): string {
  switch (clue.type) {
    case ClueType.PHOTO:
      return PHOTO_PROMPT
    case ClueType.NAME:
      return clue.prompt
    case ClueType.FLAG:
      return answer.type === AnswerType.AREA ? FLAG_AREA_PROMPT : FLAG_POINT_PROMPT
  }
}

/** The flag a clue shows, on a flag round. */
export const clueFlag = (clue: Clue): FlagCode | undefined => (clue.type === ClueType.FLAG ? clue.flag : undefined)

/** The photo a clue shows, on a landmark round. */
export const clueImage = (clue: Clue): string | undefined => (clue.type === ClueType.PHOTO ? clue.image : undefined)

/** Where an answer is: the point, or an area's centre. */
export function answerCentre(answer: Answer): LatLon {
  return answer.type === AnswerType.POINT ? answer.at : answer.centre
}

export function isArea(q: Question): q is Question & { answer: AreaAnswer } {
  return q.answer.type === AnswerType.AREA
}

/** The flag a question shows: a flag round's, or the one beside a country's name. */
export function flagShown(q: Question): FlagCode | undefined {
  if (q.clue.type === ClueType.FLAG) return q.clue.flag
  return q.type === QuestionType.COUNTRY ? q.countryFlag : undefined
}

export function commonsImageUrl(file: string, width = 900): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`
}

export function commonsPageUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`
}

/** The Wikipedia article for a place, or a search for its label when there is none. */
export function wikipediaUrl(title: string | undefined, label: string): string {
  return title
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
    : `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(label)}`
}

/** Two questions in one game should be at least this far apart when the pool allows. */
export const MIN_SPREAD_KM = 50

/** Deterministic shuffle so a playtest session can be replayed. */
export function shuffle<T>(items: T[], seed: number): T[] {
  const out = items.slice()
  let s = seed >>> 0
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}
