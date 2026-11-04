import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE, outlinesFrom } from "../catalogue/catalogue.ts"
import { PaintLayer, resolutionForTolerance } from "../paint/paint.ts"
import { RoundGuessType, type PaintSubmission } from "../protocol/views.ts"
import { FactsType } from "../awards/player-facts.ts"
import { AnswerType } from "../questions.ts"
import { regionCells, scoredAnswer, type Area, type ScoredAnswer } from "./regions.ts"
import { scoreRound, type ScoredRound } from "./round-scoring.ts"
import { DEFAULT_KERNEL, PASS_SCORE } from "./scoring.ts"
import outlinesJson from "../../outlines.json" with { type: "json" }

const OUTLINES = outlinesFrom(outlinesJson)
const answerOf = (id: string): ScoredAnswer =>
  scoredAnswer(CATALOGUE.find((question) => question.id === id)!.answer, OUTLINES)
const paris = answerOf("paris")
const germany = answerOf("germany-region") as Area

const T0 = 1_000_000
const TIMING = { startedAt: T0, roundLength: 60_000 }

const paintAround = (answer: ScoredAnswer, lat: number, lon: number): PaintSubmission => {
  const layer = new PaintLayer(resolutionForTolerance(answer.tolerance))
  layer.stamp({ lat, lon }, answer.tolerance / 2, 1)
  return { cells: layer.toRecord(), floor: 0.05 }
}

const paintAll = (area: Area): PaintSubmission => {
  const resolution = resolutionForTolerance(area.tolerance)
  return { cells: Object.fromEntries(regionCells(area, resolution).map((cell) => [cell, 1])), floor: 0.05 }
}

const EMPTY: PaintSubmission = { cells: {}, floor: 1 }
interface Guess {
  paint: PaintSubmission
  lockedAt: number | undefined
}
const makeDraft = (paint = EMPTY): Guess => ({ paint, lockedAt: undefined })
const makeLocked = (at: number, paint = EMPTY): Guess => ({ paint, lockedAt: at })

const score = (answer: ScoredAnswer, guess: Guess | undefined): ScoredRound =>
  scoreRound("Answer", answer, guess?.paint, guess?.lockedAt, DEFAULT_KERNEL, TIMING)

describe("scoreRound", () => {
  it("scores paint on a point answer, and says where it was strongest", () => {
    if (paris.type !== AnswerType.POINT) throw new Error("Paris is a point")
    const paint = paintAround(paris, paris.at.lat, paris.at.lon)
    const round = score(paris, makeDraft(paint))
    expect(round.score).toBeGreaterThan(900)
    expect(round.guess).toMatchObject({ type: RoundGuessType.PAINTED, paint, parts: { type: AnswerType.POINT } })
    expect(round.facts).toMatchObject({ type: FactsType.POINT, label: "Answer", score: round.score })
    if (round.facts.type !== FactsType.POINT) throw new Error("point facts expected")
    expect(round.facts.area).toBeGreaterThan(0)
    expect(round.facts.point.miss).toBeLessThan(paris.tolerance)
  })

  it("splits a tight miss's lost points into the spread of the paint and the cost of missing", () => {
    if (paris.type !== AnswerType.POINT) throw new Error("Paris is a point")
    const round = score(paris, makeDraft(paintAround(paris, paris.at.lat + 2.7, paris.at.lon)))
    if (round.facts.type !== FactsType.POINT) throw new Error("point facts expected")
    const { spread, missCost, miss } = round.facts.point
    expect(round.score).toBeCloseTo(420, 0)
    expect(spread).toBeCloseTo(3.5, 1)
    expect(missCost).toBeCloseTo(576.5, 1)
    expect(spread + missCost + round.score).toBeCloseTo(1000, 5)
    expect(miss).toBeCloseTo(299, 0)
    expect(round.facts.point.hedged).toBe(false)
    expect(round.facts.point.tolerance).toBe(paris.tolerance)
  })

  describe("painting next door to a country", () => {
    const france = answerOf("france-region") as Area
    const paintOf = (area: Area): PaintSubmission => {
      const resolution = resolutionForTolerance(france.tolerance)
      return { cells: Object.fromEntries(regionCells(area, resolution).map((cell) => [cell, 1])), floor: 0.05 }
    }
    const nextDoor = (painted: Area): boolean | undefined => {
      const round = score(france, makeDraft(paintOf(painted)))
      return round.facts.type === FactsType.AREA ? round.facts.region.nextDoor : undefined
    }

    it("is next door when all the paint is a neighbour's, and not otherwise", () => {
      expect(nextDoor(germany)).toBe(true)
      expect(nextDoor(france)).toBe(false)
      expect(nextDoor(answerOf("japan-region") as Area)).toBe(false)
    })

    it("is not next door when a tenth or more of the paint is on the country", () => {
      const resolution = resolutionForTolerance(france.tolerance)
      const both = [...regionCells(france, resolution), ...regionCells(germany, resolution)]
      const round = score(france, makeDraft({ cells: Object.fromEntries(both.map((cell) => [cell, 1])), floor: 0.05 }))
      expect(round.facts).toMatchObject({ type: FactsType.AREA, region: { nextDoor: false } })
    })
  })

  it("scores a pass, an empty map and no submission alike, on either kind of round, with no paint to show", () => {
    for (const answer of [paris, germany])
      for (const submission of [undefined, makeDraft(), makeLocked(T0 + 5_000)]) {
        const round = score(answer, submission)
        expect(round.score).toBe(PASS_SCORE.score)
        expect(round.guess).toEqual({ type: RoundGuessType.PASSED })
        expect(round.facts).toMatchObject({ type: FactsType.PASSED })
      }
  })

  it("scores an area painted whole near the top", () => {
    for (const area of [germany, answerOf("island-borneo") as Area]) {
      const round = score(area, makeDraft(paintAll(area)))
      expect(round.score).toBeGreaterThan(985)
      expect(round.guess).toMatchObject({ type: RoundGuessType.PAINTED, parts: { type: AnswerType.AREA } })
      expect(round.facts).toMatchObject({
        type: FactsType.AREA,
        region: { precision: expect.closeTo(1, 1), nextDoor: false }
      })
    }
  })

  it("times a lock-in from the round's start, and not a guess left to the clock", () => {
    const paint = paintAround(paris, 0, 0)
    expect(score(paris, makeLocked(T0 + 12_000, paint)).facts.lockedAfter).toBe(12_000)
    expect(score(paris, makeDraft(paint)).facts.lockedAfter).toBeUndefined()
  })
})
