import { describe, expect, it } from "vite-plus/test"
import { GUESS_KINDS, REVIEW_FLOOR, REVIEW_SET_SIZE, reviewCases } from "./score-review.ts"
import { buildDistribution, scoreDistribution } from "./scoring.ts"

const score = (c: ReturnType<typeof reviewCases>[number]) =>
  scoreDistribution(buildDistribution(c.layer.toCells(), REVIEW_FLOOR), c.question.answer, c.question.toleranceKm).score

describe("score review cases", () => {
  it("are the same for a set every time, and differ between sets", () => {
    const record = (set: number) => reviewCases(set).map((c) => [c.question.id, c.guess, c.layer.toRecord()])
    expect(record(1)).toEqual(record(1))
    expect(record(2)).not.toEqual(record(1))
  })

  it("paint every kind of guess, each on its own question", () => {
    const cases = reviewCases(1)
    expect(cases).toHaveLength(REVIEW_SET_SIZE)
    expect(new Set(cases.map((c) => c.guess))).toEqual(new Set(GUESS_KINDS))
    expect(new Set(cases.map((c) => c.question.id)).size).toBe(REVIEW_SET_SIZE)
    for (const c of cases) expect(c.layer.size, c.question.id).toBeGreaterThan(0)
  })

  it("score a guess on the answer above one far off", () => {
    const cases = reviewCases(1)
    const mean = (kind: string) => {
      const s = cases.filter((c) => c.guess === kind).map(score)
      return s.reduce((a, b) => a + b, 0) / s.length
    }
    expect(mean("bullseye")).toBeGreaterThan(mean("near-miss"))
    expect(mean("near-miss")).toBeGreaterThan(mean("far-miss"))
  })
})
