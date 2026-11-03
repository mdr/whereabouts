// The catalogue's questions as the scoring scripts take them: a country as
// its scored area (outline polygons, centre, tolerance) with its id and
// label; a place as its point.
import { readFileSync } from "node:fs"
import type { LatLon } from "../src/geo.ts"
import { CATALOGUE, outlinesFrom } from "../src/catalogue/catalogue.ts"
import { AnswerType, QuestionType, type Question } from "../src/questions.ts"
import { scoredAnswer, type Area } from "../src/scoring/regions.ts"
import type { Km } from "../src/units.ts"

export type ScoredQuestion = Area & { id: string; label: string }

export interface PointPlace {
  id: string
  label: string
  answer: LatLon
  tolerance: Km
}

const outlines = outlinesFrom(JSON.parse(readFileSync(new URL("../outlines.json", import.meta.url), "utf8")))

export const areaOf = (question: Question): ScoredQuestion => {
  const answer = scoredAnswer(question.answer, outlines)
  if (answer.type !== AnswerType.AREA) throw new Error(`${question.id} is not asked as an area`)
  return { id: question.id, label: question.label, ...answer }
}

export const COUNTRIES: ScoredQuestion[] = CATALOGUE.filter((question) => question.type === QuestionType.COUNTRY).map(
  areaOf
)

export const PLACES: PointPlace[] = CATALOGUE.flatMap((question) =>
  question.answer.type === AnswerType.POINT
    ? [
        {
          id: question.id,
          label: question.label,
          answer: question.answer.at,
          tolerance: question.answer.tolerance
        }
      ]
    : []
)

export const questionById = (id: string): Question | undefined => CATALOGUE.find((question) => question.id === id)
