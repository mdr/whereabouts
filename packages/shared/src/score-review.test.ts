import { describe, expect, it } from "vite-plus/test"
import outlinesJson from "../outlines.json" with { type: "json" }
import { CATALOGUE, outlinesFrom } from "./catalogue.ts"
import { AnswerType, QuestionType } from "./questions.ts"
import {
  POINT_GUESSES,
  REGION_GUESSES,
  REVIEW_SET_SIZE,
  reviewCases,
  guessCase,
  scoreGuess,
  type ReviewCase
} from "./score-review.ts"
import { DEFAULT_KERNEL } from "./scoring.ts"
import { decodeCase } from "./scoring-case.ts"

const OUTLINES = outlinesFrom(outlinesJson)
const casesOf = (set: number) => reviewCases(set, CATALOGUE, OUTLINES)
const isArea = (c: ReviewCase) => c.answer.type === AnswerType.AREA

const guesses = (c: ReviewCase) => (c.kind === "single" ? [c.guess] : c.guesses)
const score = (c: ReviewCase, i = 0) => scoreGuess(c.answer, guesses(c)[i]!.layer, DEFAULT_KERNEL).score

describe("score review cases", () => {
  const cases = casesOf(1)

  it("are the same for a set every time, and differ between sets", () => {
    const record = (set: number) =>
      casesOf(set).map((c) => [c.question.id, ...guesses(c).map((g) => [g.kind, g.layer.toRecord()])])
    expect(record(1)).toEqual(record(1))
    expect(record(2)).not.toEqual(record(1))
  })

  it("ask about places, countries, features and states, some as pairs", () => {
    expect(cases).toHaveLength(REVIEW_SET_SIZE)
    expect(new Set(cases.map((c) => c.question.id)).size).toBe(REVIEW_SET_SIZE)
    expect(cases.filter((c) => c.kind === "pair")).toHaveLength(8)
    for (const type of [QuestionType.COUNTRY, QuestionType.FEATURE, QuestionType.STATE])
      expect(
        cases.some((c) => c.question.type === type),
        type
      ).toBe(true)
  })

  it("paint guesses that suit the question, two different ones in a pair", () => {
    for (const c of cases) {
      const kinds: readonly string[] = isArea(c) ? REGION_GUESSES : POINT_GUESSES
      for (const g of guesses(c)) {
        expect(kinds, c.question.id).toContain(g.kind)
        expect(g.layer.size, `${c.question.id} ${g.kind}`).toBeGreaterThan(0)
      }
      if (c.kind === "pair") expect(c.guesses[0].kind).not.toBe(c.guesses[1].kind)
    }
  })

  it("score painting a whole country above painting far from it", () => {
    const all = [1, 2, 3, 4].flatMap((set) => casesOf(set))
    const mean = (kind: string) => {
      const s = all.flatMap((c) => guesses(c).flatMap((g, i) => (isArea(c) && g.kind === kind ? [score(c, i)] : [])))
      return s.reduce((a, b) => a + b, 0) / s.length
    }
    expect(mean("whole")).toBeGreaterThan(mean("neighbour"))
    expect(mean("neighbour")).toBeGreaterThan(mean("far-miss"))
  })

  it("write a guess as a scoring case with the score shown", async () => {
    const c = cases.find(isArea)!
    const decoded = await decodeCase(await guessCase(c.question, c.answer, guesses(c)[0]!.layer, DEFAULT_KERNEL))
    expect(decoded.question.id).toBe(c.question.id)
    expect(decoded.score).toBeCloseTo(score(c), 0)
  })
})
