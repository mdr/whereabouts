import { z } from "zod"
import catalogueJson from "../catalogue.json" with { type: "json" }
import { outlineId } from "./ids.ts"
import { showsLakes, type MapDetail } from "./protocol.ts"
import {
  FeatureType,
  QUESTION_TYPES,
  QuestionSchema,
  QuestionType,
  isArea,
  type FlagQuestion,
  type Outline,
  type Outlines,
  type Question
} from "./questions.ts"

/** Every question, from catalogue.json. */
export const CATALOGUE: readonly Question[] = z.array(QuestionSchema).parse(catalogueJson)

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
