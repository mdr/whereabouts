// How the build scripts write their questions: each replaces the catalogue's
// questions of its own types, keeping the rest, with the places they are
// about. Places and outlines follow the questions, so places.json holds
// exactly the places asked about and outlines.json exactly the areas painted.
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import type { LatLon, MultiPolygon } from "../src/geo.ts"
import {
  AnswerType,
  QUESTION_TYPES,
  type ClueType,
  type FeatureType,
  type NameClue,
  type PartOf,
  type PhotoClue,
  type QuestionType,
  type Surface
} from "../src/questions.ts"

/** A question as catalogue.json stores it. */
export interface StoredQuestion {
  id: string
  type: QuestionType
  place: string
  clue: PhotoClue | NameClue | { type: ClueType.FLAG }
  answer: { type: AnswerType; tolerance?: number }
}

export interface StoredArea {
  outline: string
  disputed?: string
  centre: LatLon
  tolerance: number
  surface: Surface
}

/** A place as places.json stores it. */
export interface StoredPlace {
  id: string
  label: string
  wiki: string
  at?: LatLon
  feature?: FeatureType
  area?: StoredArea
  flag?: { code: string; wiki: string }
  partOf?: PartOf
}

export type Outlines = Record<string, MultiPolygon>

const file = (name: string): URL => new URL(`../${name}`, import.meta.url)
const read = <T>(name: string): T => JSON.parse(readFileSync(file(name), "utf8")) as T

const sortedCatalogue = (types: QuestionType[], questions: StoredQuestion[]): StoredQuestion[] =>
  [...read<StoredQuestion[]>("catalogue.json").filter((question) => !types.includes(question.type)), ...questions]
    .sort((a, b) => QUESTION_TYPES.indexOf(a.type) - QUESTION_TYPES.indexOf(b.type))
    .map(({ id, type, place, clue, answer }) => ({ id, type, place, clue, answer }))

/** The fields that are set, in order. */
const setOnly = <T extends object>(fields: T): Partial<T> =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<T>

/** The places the catalogue asks about, each once, with optional fields only when set. */
const placesAsked = (catalogue: StoredQuestion[], places: StoredPlace[]): Map<string, StoredPlace> => {
  const allPlaces = new Map(read<StoredPlace[]>("places.json").map((place) => [place.id, place]))
  for (const place of places) allPlaces.set(place.id, { ...allPlaces.get(place.id), ...place })
  const asked = new Map<string, StoredPlace>()
  for (const question of catalogue) {
    const place = allPlaces.get(question.place)
    if (!place) throw new Error(`${question.id}: no place ${question.place}`)
    if (asked.has(question.place)) continue
    const { id, label, wiki, at, feature, area, flag, partOf } = place
    asked.set(id, { id, label, wiki, ...setOnly({ at, feature, area, flag, partOf }) })
  }
  return asked
}

/** The outlines of the areas the catalogue's AREA questions are about, and their disputed land, by id. */
const outlinesUsed = (catalogue: StoredQuestion[], asked: Map<string, StoredPlace>, outlines: Outlines): Outlines => {
  const allOutlines = { ...read<Outlines>("outlines.json"), ...outlines }
  const used: Outlines = {}
  for (const question of catalogue) {
    if (question.answer.type !== AnswerType.AREA) continue
    const area = asked.get(question.place)?.area
    for (const id of [area?.outline, ...(area?.disputed ? [area.disputed] : [])]) {
      const outline = id === undefined ? undefined : allOutlines[id]
      if (!id || !outline) throw new Error(`${question.id}: no outline ${id}`)
      used[id] = outline
    }
  }
  return used
}

/**
 * Write `questions` as the catalogue's questions of `types`, with the places
 * they bring (over any of the same id, keeping what they leave out) and those places' outlines by id.
 */
export const writeQuestions = (
  types: QuestionType[],
  questions: StoredQuestion[],
  places: StoredPlace[],
  outlines: Outlines
): void => {
  const catalogue = sortedCatalogue(types, questions)
  const asked = placesAsked(catalogue, places)
  const used = outlinesUsed(catalogue, asked, outlines)
  writeFileSync(file("catalogue.json"), JSON.stringify(catalogue) + "\n")
  writeFileSync(file("places.json"), JSON.stringify([...asked.values()]) + "\n")
  execFileSync("pnpm", ["exec", "vp", "fmt", "catalogue.json", "places.json"], { cwd: file("."), stdio: "inherit" })
  const json = JSON.stringify(used)
  writeFileSync(file("outlines.json"), json + "\n")
  console.log(
    `wrote ${questions.length} questions of ${types.join(", ")}; ${asked.size} places, ${Object.keys(used).length} outlines, ${Math.round(json.length / 1024)} KB`
  )
}
