// The catalogue's questions as the scoring scripts take them: a country as
// its scored area (outline polygons, centre, tolerance) with its id and
// label; a place as its point.
import { readFileSync } from "node:fs"
import { CATALOGUE, outlinesFrom } from "../src/catalogue/catalogue.ts"
import { AnswerType, QuestionType } from "../src/questions.ts"
import { scoredAnswer } from "../src/scoring/regions.ts"

const outlines = outlinesFrom(JSON.parse(readFileSync(new URL("../outlines.json", import.meta.url), "utf8")))

export const areaOf = (q) => ({ id: q.id, label: q.label, ...scoredAnswer(q.answer, outlines) })

export const COUNTRIES = CATALOGUE.filter((q) => q.type === QuestionType.COUNTRY).map(areaOf)

export const PLACES = CATALOGUE.filter((q) => q.answer.type === AnswerType.POINT).map((q) => ({
  id: q.id,
  label: q.label,
  answer: q.answer.at,
  tolerance: q.answer.tolerance
}))

export const questionById = (id) => CATALOGUE.find((q) => q.id === id)
