// The catalogue's questions as the scoring scripts take them: a country as
// its scored area (outline polygons, centre, tolerance) with its id and
// label; a place as its point.
import { readFileSync } from "node:fs"
import { CATALOGUE, outlinesFrom } from "../src/catalogue/catalogue.ts"
import { AnswerType, QuestionType } from "../src/questions.ts"
import { scoredAnswer } from "../src/scoring/regions.ts"

const outlines = outlinesFrom(JSON.parse(readFileSync(new URL("../outlines.json", import.meta.url), "utf8")))

export const areaOf = (question) => ({
  id: question.id,
  label: question.label,
  ...scoredAnswer(question.answer, outlines)
})

export const COUNTRIES = CATALOGUE.filter((question) => question.type === QuestionType.COUNTRY).map(areaOf)

export const PLACES = CATALOGUE.filter((question) => question.answer.type === AnswerType.POINT).map((question) => ({
  id: question.id,
  label: question.label,
  answer: question.answer.at,
  tolerance: question.answer.tolerance
}))

export const questionById = (id) => CATALOGUE.find((question) => question.id === id)
