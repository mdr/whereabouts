import { describe, expect, it } from "vite-plus/test"
import outlinesJson from "../../outlines.json" with { type: "json" }
import { CATALOGUE, outlinesFrom } from "../catalogue/catalogue.ts"
import { AnswerType, QuestionType } from "../questions.ts"
import {
  POINT_GUESSES,
  REGION_GUESSES,
  REVIEW_SET_SIZE,
  GuessType,
  ReviewCaseType,
  reviewCases,
  guessCase,
  scoreGuess,
  type ReviewCase
} from "./score-review.ts"
import { DEFAULT_KERNEL } from "./scoring.ts"
import { decodeCase } from "./scoring-case.ts"

const OUTLINES = outlinesFrom(outlinesJson)
const casesOf = (set: number) => reviewCases(set, CATALOGUE, OUTLINES)
const isArea = (reviewCase: ReviewCase) => reviewCase.answer.type === AnswerType.AREA

// These score many paints: about 2 s alone, several times that on a busy machine.
const HEAVY = { timeout: 20_000 }

const guesses = (reviewCase: ReviewCase) =>
  reviewCase.type === ReviewCaseType.SINGLE ? [reviewCase.guess] : reviewCase.guesses
const score = (reviewCase: ReviewCase, i = 0) =>
  scoreGuess(reviewCase.answer, guesses(reviewCase)[i]!.layer, DEFAULT_KERNEL).score

describe("score review cases", () => {
  const cases = casesOf(1)

  it("are the same for a set every time, and differ between sets", HEAVY, () => {
    const record = (set: number) =>
      casesOf(set).map((reviewCase) => [
        reviewCase.question.id,
        ...guesses(reviewCase).map((guess) => [guess.type, guess.layer.toRecord()])
      ])
    expect(record(1)).toEqual(record(1))
    expect(record(2)).not.toEqual(record(1))
  })

  it("ask about places, countries, features and states, some as pairs", () => {
    expect(cases).toHaveLength(REVIEW_SET_SIZE)
    expect(new Set(cases.map((reviewCase) => reviewCase.question.id)).size).toBe(REVIEW_SET_SIZE)
    expect(cases.filter((reviewCase) => reviewCase.type === ReviewCaseType.PAIR)).toHaveLength(8)
    for (const type of [QuestionType.COUNTRY, QuestionType.FEATURE, QuestionType.STATE])
      expect(
        cases.some((reviewCase) => reviewCase.question.type === type),
        type
      ).toBe(true)
  })

  it("paint guesses that suit the question, two different ones in a pair", () => {
    for (const reviewCase of cases) {
      const types = isArea(reviewCase) ? REGION_GUESSES : POINT_GUESSES
      for (const guess of guesses(reviewCase)) {
        expect(types, reviewCase.question.id).toContain(guess.type)
        expect(guess.layer.size, `${reviewCase.question.id} ${guess.type}`).toBeGreaterThan(0)
      }
      if (reviewCase.type === ReviewCaseType.PAIR)
        expect(reviewCase.guesses[0].type).not.toBe(reviewCase.guesses[1].type)
    }
  })

  it("score painting a whole country above painting far from it", HEAVY, () => {
    const all = [1, 2, 3, 4].flatMap((set) => casesOf(set))
    const mean = (type: GuessType) => {
      const scores = all.flatMap((reviewCase) =>
        guesses(reviewCase).flatMap((guess, i) =>
          isArea(reviewCase) && guess.type === type ? [score(reviewCase, i)] : []
        )
      )
      return scores.reduce((a, b) => a + b, 0) / scores.length
    }
    expect(mean(GuessType.WHOLE)).toBeGreaterThan(mean(GuessType.NEIGHBOUR))
    expect(mean(GuessType.NEIGHBOUR)).toBeGreaterThan(mean(GuessType.FAR_MISS))
  })

  it("write a guess as a scoring case with the score shown", async () => {
    const c = cases.find(isArea)!
    const decoded = await decodeCase(await guessCase(c.question, c.answer, guesses(c)[0]!.layer, DEFAULT_KERNEL))
    expect(decoded.question.id).toBe(c.question.id)
    expect(decoded.score).toBeCloseTo(score(c), 0)
  })
})
