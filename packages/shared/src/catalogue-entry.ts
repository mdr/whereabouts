/**
 * A question as catalogue.json holds it: what is about the question alone,
 * with its place by id. An area answer, a flag clue, the label and the
 * article come from the place when the catalogue is joined.
 */
import { z } from "zod"
import { PlaceIdSchema, QuestionIdSchema, type PlaceId, type QuestionId } from "./ids.ts"
import type { Place } from "./places.ts"
import {
  AnswerType,
  ClueType,
  NameClueSchema,
  PhotoClueSchema,
  PointAnswerSchema,
  QuestionType,
  type AreaAnswer,
  type NameClue,
  type PhotoClue,
  type PointAnswer,
  type Question
} from "./questions.ts"

type StoredAnswer = PointAnswer | { type: AnswerType.AREA }

interface EntryBase {
  id: QuestionId
  place: PlaceId
}

export type CatalogueEntry = EntryBase &
  (
    | { type: QuestionType.LANDMARK; clue: PhotoClue; answer: PointAnswer }
    | { type: QuestionType.PLACE; clue: NameClue; answer: PointAnswer }
    | { type: QuestionType.COUNTRY; clue: NameClue; answer: { type: AnswerType.AREA } }
    | { type: QuestionType.FLAG; clue: { type: ClueType.FLAG }; answer: StoredAnswer }
    | { type: QuestionType.FEATURE; clue: NameClue; answer: { type: AnswerType.AREA } }
    | { type: QuestionType.STATE; clue: NameClue; answer: StoredAnswer }
  )

const AreaSchema = z.strictObject({ type: z.literal(AnswerType.AREA) })
const AnyAnswerSchema = z.discriminatedUnion("type", [PointAnswerSchema, AreaSchema])
const base = { id: QuestionIdSchema, place: PlaceIdSchema }

export const CatalogueEntrySchema: z.ZodType<CatalogueEntry> = z.discriminatedUnion("type", [
  z.strictObject({ ...base, type: z.literal(QuestionType.LANDMARK), clue: PhotoClueSchema, answer: PointAnswerSchema }),
  z.strictObject({ ...base, type: z.literal(QuestionType.PLACE), clue: NameClueSchema, answer: PointAnswerSchema }),
  z.strictObject({ ...base, type: z.literal(QuestionType.COUNTRY), clue: NameClueSchema, answer: AreaSchema }),
  z.strictObject({
    ...base,
    type: z.literal(QuestionType.FLAG),
    clue: z.strictObject({ type: z.literal(ClueType.FLAG) }),
    answer: AnyAnswerSchema
  }),
  z.strictObject({ ...base, type: z.literal(QuestionType.FEATURE), clue: NameClueSchema, answer: AreaSchema }),
  z.strictObject({ ...base, type: z.literal(QuestionType.STATE), clue: NameClueSchema, answer: AnyAnswerSchema })
])

/** The question as the game sees it, with what it takes from its place. */
export function joinQuestion(entry: CatalogueEntry, places: ReadonlyMap<PlaceId, Place>): Question {
  const place = places.get(entry.place)
  if (!place) throw new Error(`${entry.id}: no place ${entry.place}`)
  const area = (): AreaAnswer => {
    if (!place.area) throw new Error(`${entry.id}: ${place.id} has no area`)
    return { type: AnswerType.AREA, ...place.area }
  }
  const answer = (a: StoredAnswer) => (a.type === AnswerType.AREA ? area() : a)
  const common = { id: entry.id, place: place.id, label: place.label, wiki: place.wiki }
  switch (entry.type) {
    case QuestionType.LANDMARK:
      return { ...common, type: entry.type, clue: entry.clue, answer: entry.answer }
    case QuestionType.PLACE:
      return { ...common, type: entry.type, clue: entry.clue, answer: entry.answer }
    case QuestionType.COUNTRY:
      return {
        ...common,
        type: entry.type,
        clue: entry.clue,
        answer: area(),
        ...(place.flag ? { countryFlag: place.flag.code } : {})
      }
    case QuestionType.FLAG: {
      if (!place.flag) throw new Error(`${entry.id}: ${place.id} has no flag`)
      return {
        ...common,
        wiki: place.flag.wiki,
        type: entry.type,
        clue: { type: ClueType.FLAG, flag: place.flag.code },
        answer: answer(entry.answer)
      }
    }
    case QuestionType.FEATURE:
      if (!place.feature) throw new Error(`${entry.id}: ${place.id} is not a feature`)
      return { ...common, type: entry.type, feature: place.feature, clue: entry.clue, answer: area() }
    case QuestionType.STATE:
      return { ...common, type: entry.type, clue: entry.clue, answer: answer(entry.answer) }
  }
}
