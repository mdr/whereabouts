import { z } from "zod"
import catalogueJson from "../../catalogue.json" with { type: "json" }
import placesJson from "../../places.json" with { type: "json" }
import { CatalogueEntrySchema, joinQuestion } from "./catalogue-entry.ts"
import { outlineId } from "../ids.ts"
import { placesFrom } from "./places.ts"
import { showsLakes, type MapDetail } from "../protocol.ts"
import {
  FeatureType,
  QUESTION_TYPES,
  QuestionType,
  isArea,
  type FlagQuestion,
  type Outline,
  type Outlines,
  type Question
} from "../questions.ts"

/** Every place, from places.json. */
export const PLACES = placesFrom(placesJson)

/** Every question, from catalogue.json, joined with its place. */
export const CATALOGUE: readonly Question[] = z
  .array(CatalogueEntrySchema)
  .parse(catalogueJson)
  .map((entry) => joinQuestion(entry, PLACES))

/** The types with questions painted whole, which need the outlines. */
export const AREA_TYPES: readonly QuestionType[] = QUESTION_TYPES.filter((t) =>
  CATALOGUE.some((q) => q.type === t && isArea(q))
)

/** outlines.json as read. */
export function outlinesFrom(json: Record<string, Outline>): Outlines {
  return new Map(Object.entries(json).map(([id, outline]) => [outlineId(id), outline]))
}

/** Whether a question can be asked on this map: lakes only on a map that draws them. */
function eligible(q: Question, mapDetail: MapDetail): boolean {
  return q.type !== QuestionType.FEATURE || q.feature !== FeatureType.LAKE || showsLakes(mapDetail)
}

/** The questions of these types that can be asked on this map. Games, practice and score review all draw from here. */
export function poolOf(
  catalogue: readonly Question[],
  types: readonly QuestionType[],
  mapDetail: MapDetail
): Question[] {
  return catalogue.filter((q) => types.includes(q.type) && eligible(q, mapDetail))
}

export const isFlagQuestion = (q: Question): q is FlagQuestion => q.type === QuestionType.FLAG
