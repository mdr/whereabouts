import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE, outlinesFrom } from "../catalogue/catalogue.ts"
import { PaintLayer, resolutionForTolerance } from "../paint/paint.ts"
import type { PaintSubmission } from "../protocol.ts"
import { AnswerType } from "../questions.ts"
import { regionCells, scoredAnswer, type Area, type ScoredAnswer } from "./regions.ts"
import { scoreRound, type Submission } from "./round-scoring.ts"
import { DEFAULT_KERNEL, PASS_SCORE } from "./scoring.ts"
import outlinesJson from "../../outlines.json" with { type: "json" }

const OUTLINES = outlinesFrom(outlinesJson)
const answerOf = (id: string) => scoredAnswer(CATALOGUE.find((q) => q.id === id)!.answer, OUTLINES)
const paris = answerOf("paris")
const germany = answerOf("germany-region") as Area

const T0 = 1_000_000
const TIMING = { startedAt: T0, roundLength: 60_000 }

function paintAround(answer: ScoredAnswer, lat: number, lon: number): PaintSubmission {
  const layer = new PaintLayer(resolutionForTolerance(answer.tolerance))
  layer.stamp({ lat, lon }, answer.tolerance / 2, 1)
  return { cells: layer.toRecord(), floor: 0.05 }
}

function paintAll(area: Area): PaintSubmission {
  const res = resolutionForTolerance(area.tolerance)
  return { cells: Object.fromEntries(regionCells(area, res).map((h) => [h, 1])), floor: 0.05 }
}

const makeSubmission = (s: Partial<Submission> = {}): Submission => ({
  paint: { cells: {}, floor: 1 },
  locked: false,
  ...s
})

const score = (answer: ScoredAnswer, submission: Submission | undefined) =>
  scoreRound("Answer", answer, submission, DEFAULT_KERNEL, TIMING)

describe("scoreRound", () => {
  it("scores paint on a point answer, and says where it was strongest", () => {
    if (paris.type !== AnswerType.POINT) throw new Error("Paris is a point")
    const paint = paintAround(paris, paris.at.lat, paris.at.lon)
    const round = score(paris, makeSubmission({ paint }))
    expect(round.score).toBeGreaterThan(900)
    expect(round.parts.type).toBe(AnswerType.POINT)
    expect(round.paint).toBe(paint)
    expect(round.facts).toMatchObject({ label: "Answer", score: round.score, passed: false })
    expect(round.facts.area).toBeGreaterThan(0)
    expect(round.facts.point?.miss).toBeLessThan(paris.tolerance)
    expect(round.facts.region).toBeUndefined()
  })

  it("scores a pass, an empty map and no submission alike, on either kind of round, with no paint to show", () => {
    for (const answer of [paris, germany])
      for (const submission of [undefined, makeSubmission(), makeSubmission({ locked: true, lockedAt: T0 + 5_000 })]) {
        const round = score(answer, submission)
        expect(round.score).toBe(PASS_SCORE.score)
        expect(round.parts).toEqual({ type: AnswerType.POINT, A: PASS_SCORE.A, B: PASS_SCORE.B })
        expect(round.paint).toBeUndefined()
        expect(round.facts).toMatchObject({ passed: true, area: 0 })
      }
  })

  it("scores an area painted whole near the top, with how the paint sat against the outline", () => {
    for (const area of [germany, answerOf("island-borneo") as Area]) {
      const round = score(area, makeSubmission({ paint: paintAll(area) }))
      expect(round.score).toBeGreaterThan(985)
      if (round.parts.type !== AnswerType.AREA) throw new Error("area parts expected")
      expect(round.parts.coverage).toBeGreaterThan(0.95)
      expect(round.parts.precision).toBeGreaterThan(0.95)
      expect(round.facts.region).toEqual({ precision: round.parts.precision, nextDoor: false })
      expect(round.facts.point).toBeUndefined()
    }
  })

  it("times a lock-in from the round's start, and not a guess left to the clock", () => {
    const paint = paintAround(paris, 0, 0)
    expect(score(paris, makeSubmission({ paint, locked: true, lockedAt: T0 + 12_000 })).facts.lockedAfter).toBe(12_000)
    expect(score(paris, makeSubmission({ paint, lockedAt: T0 + 12_000 })).facts.lockedAfter).toBeUndefined()
    expect(score(paris, makeSubmission({ paint })).facts.lockedAfter).toBeUndefined()
  })
})
