/**
 * The questions a round can ask. Each is about a place, and has a type (its
 * slot in a game's mix and practice's choice), a clue (what the player sees)
 * and an answer (what they mark, and so how it is scored). A Question here
 * is as the game sees it, joined with its place (see catalogue-entry.ts).
 */
import { z } from "zod"
import type { LatLon } from "./geo.ts"
import { DegreesSchema, type Km } from "./units.ts"
import {
  CommonsFileSchema,
  type CommonsFile,
  type FlagCode,
  type OutlineId,
  type PlaceId,
  type QuestionId,
  type WikiTitle
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

export interface PhotoClue {
  type: ClueType.PHOTO
  /** Wikimedia Commons file name (without the File: prefix). */
  image: CommonsFile
}

export interface NameClue {
  type: ClueType.NAME
  /** The question as asked, naming the place: phrasings vary too much to build. */
  prompt: string
}

/** The place's flag. */
interface FlagClue {
  type: ClueType.FLAG
  flag: FlagCode
}

export type Clue = PhotoClue | NameClue | FlagClue

export interface PointAnswer {
  type: AnswerType.POINT
  at: LatLon
  tolerance: Km
}

/** The place's area. */
export interface AreaAnswer {
  type: AnswerType.AREA
  outline: OutlineId
  /** Area-weighted centre, for framing the map. */
  centre: LatLon
  /** A fifth of the area's equivalent radius, sqrt(area / pi). */
  tolerance: Km
  surface: Surface
}

export type Answer = PointAnswer | AreaAnswer

interface QuestionBase {
  id: QuestionId
  place: PlaceId
  /** The place's name, shown after the reveal. */
  label: string
  /** English Wikipedia article title, linked from the reveal. */
  wiki: WikiTitle
}

export interface LandmarkQuestion extends QuestionBase {
  type: QuestionType.LANDMARK
  clue: PhotoClue
  answer: PointAnswer
}

export interface PlaceQuestion extends QuestionBase {
  type: QuestionType.PLACE
  clue: NameClue
  answer: PointAnswer
}

interface CountryQuestion extends QuestionBase {
  type: QuestionType.COUNTRY
  clue: NameClue
  answer: AreaAnswer
  /** Shown beside the country's name to help players learn it. */
  countryFlag?: FlagCode
}

/** A country found from its flag: painted whole when big enough to, else marked as a point. Its wiki is the article on the flag. */
export interface FlagQuestion extends QuestionBase {
  type: QuestionType.FLAG
  clue: FlagClue
  answer: PointAnswer | AreaAnswer
}

export interface FeatureQuestion extends QuestionBase {
  type: QuestionType.FEATURE
  feature: FeatureType
  clue: NameClue
  answer: AreaAnswer
}

/** A US state: painted whole, or marked as a point when too small to paint. */
interface StateQuestion extends QuestionBase {
  type: QuestionType.STATE
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

export const LatLonSchema = z.object({ lat: DegreesSchema, lon: DegreesSchema })
export const PhotoClueSchema = z.object({ type: z.literal(ClueType.PHOTO), image: CommonsFileSchema })
export const NameClueSchema = z.object({ type: z.literal(ClueType.NAME), prompt: z.string() })

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
export const clueImage = (clue: Clue): CommonsFile | undefined =>
  clue.type === ClueType.PHOTO ? clue.image : undefined

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

export function commonsImageUrl(file: CommonsFile, width = 900): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`
}

export function commonsPageUrl(file: CommonsFile): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, "_"))}`
}

/** The Wikipedia article for a place, or a search for its label when there is none. */
export function wikipediaUrl(title: WikiTitle | undefined, label: string): string {
  return title
    ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`
    : `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(label)}`
}

/** Two questions in one game should be at least this far apart when the pool allows. */
export const MIN_SPREAD: Km = 50

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
