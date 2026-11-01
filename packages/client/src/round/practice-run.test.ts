import { describe, expect, it } from "vite-plus/test"
import { outlineId, placeId, questionId, wikiTitle } from "@whereabouts/shared/ids"
import { cellAreaKm2, cellToLatLng, gridDisk, latLngToCell } from "@whereabouts/shared/h3"
import { resolutionForTolerance } from "@whereabouts/shared/paint/paint"
import { scoredAnswer } from "@whereabouts/shared/scoring/regions"
import { DEFAULT_KERNEL, PASS_SCORE, buildDistribution } from "@whereabouts/shared/scoring/scoring"
import { RevealedShapeType } from "./revealed-shape"
import {
  AnswerType,
  ClueType,
  QuestionType,
  Surface,
  type Outline,
  type PlaceQuestion,
  type Question
} from "@whereabouts/shared/questions"
import type { LatLon } from "@whereabouts/shared/geo"
import {
  PracticePhase,
  currentQuestion,
  isLastRound,
  nextLabel,
  nextRound,
  revealedFromQuestion,
  roundsTable,
  runMaximum,
  runTotal,
  startRun,
  submitRound,
  type PaintingRun,
  type RevealingRun
} from "./practice-run"

function makePlace(id: string, at: LatLon = { lat: 35, lon: 135.8 }): PlaceQuestion {
  return {
    type: QuestionType.PLACE,
    id: questionId(id),
    place: placeId(id),
    label: id,
    wiki: wikiTitle(id),
    clue: { type: ClueType.NAME, prompt: `Where is ${id}?` },
    answer: { type: AnswerType.POINT, at, tolerance: 50 }
  }
}

const POOL = ["kyoto", "lima", "oslo"].map((id) => makePlace(id))

/** Paint packed round `at`, at the question's painting resolution. */
function blob(at: LatLon) {
  const h3 = latLngToCell(at.lat, at.lon, resolutionForTolerance(50))
  return buildDistribution(
    gridDisk(h3, 2).map((h) => {
      const [lat, lon] = cellToLatLng(h)
      return { lat, lon, intensity: 1, area: cellAreaKm2(h), h3: h }
    }),
    0.05
  )
}

/** Answer the current question: on its answer, or a pass. */
function play(run: PaintingRun, pass = false): RevealingRun {
  const q = currentQuestion(run)
  if (q.answer.type !== AnswerType.POINT) throw new Error("a point question")
  return submitRound(run, pass ? undefined : blob(q.answer.at), scoredAnswer(q.answer, new Map()), DEFAULT_KERNEL)
}

/** Move on from a reveal that isn't the last. */
function onward(run: RevealingRun): PaintingRun {
  const next = nextRound(run)
  if (next.type !== PracticePhase.PAINT) throw new Error("not the last round")
  return next
}

describe("a practice run", () => {
  it("starts painting the first of the whole pool, shuffled by its seed", () => {
    const run = startRun(POOL, 7)
    expect(run.type).toBe(PracticePhase.PAINT)
    expect(run.index).toBe(0)
    expect(run.results).toEqual([])
    expect([...run.questions].sort((a, b) => a.id.localeCompare(b.id))).toEqual(POOL)
    expect(startRun(POOL, 7).questions).toEqual(run.questions)
    expect(currentQuestion(run)).toBe(run.questions[0])
  })

  it("leaves the pool it was given as it was", () => {
    const pool = [...POOL]
    startRun(pool, 7)
    expect(pool).toEqual(POOL)
  })

  it("scores a submitted round and shows its reveal", () => {
    const run = play(startRun(POOL, 7))
    expect(run.type).toBe(PracticePhase.REVEAL)
    expect(run.results).toHaveLength(1)
    expect(run.results[0]!.question).toBe(run.questions[0])
    expect(run.results[0]!.score).toBeGreaterThan(900)
    expect(run.revealed.result).toBe(run.results[0])
    expect(run.revealed.dist).toBeDefined()
  })

  it("scores a pass as a game does, with no paint to show", () => {
    const run = play(startRun(POOL, 7), true)
    expect(run.results[0]!.score).toBe(PASS_SCORE.score)
    expect(run.revealed.dist).toBeUndefined()
  })

  it("goes on to the next question after a reveal", () => {
    const run = onward(play(startRun(POOL, 7)))
    expect(run.type).toBe(PracticePhase.PAINT)
    expect(currentQuestion(run)).toBe(run.questions[1])
    expect(run.results).toHaveLength(1)
    expect(run).not.toHaveProperty("revealed")
  })

  it("ends after the last question's reveal, keeping every round", () => {
    let revealing = play(startRun(POOL, 7))
    for (let i = 0; i < POOL.length - 1; i++) {
      expect(isLastRound(revealing)).toBe(false)
      expect(nextLabel(revealing)).toBe("Next question")
      revealing = play(onward(revealing), i === 0)
    }
    expect(isLastRound(revealing)).toBe(true)
    expect(nextLabel(revealing)).toBe("Finish")
    const run = nextRound(revealing)
    expect(run.type).toBe(PracticePhase.DONE)
    expect(run.results.map((r) => r.question)).toEqual(run.questions)
  })

  it("totals its rounds out of a thousand a question", () => {
    const run = play(onward(play(startRun(POOL, 7))), true)
    expect(runTotal(run)).toBe(run.results[0]!.score + PASS_SCORE.score)
    expect(runMaximum(run)).toBe(3000)
  })
})

describe("roundsTable", () => {
  it("lists the rounds latest first, numbered in the order played, scores rounded", () => {
    const [kyoto, lima] = POOL
    expect(
      roundsTable([
        { question: kyoto!, score: 912.6 },
        { question: lima!, score: 1234.4 }
      ])
    ).toEqual({
      title: "Your rounds",
      rows: [
        { name: "2. lima", total: (1234).toLocaleString() },
        { name: "1. kyoto", total: "913" }
      ]
    })
  })
})

describe("revealedFromQuestion", () => {
  it("is a point question's own place", () => {
    const kyoto = makePlace("kyoto")
    expect(revealedFromQuestion(kyoto, new Map())).toMatchObject({
      label: "kyoto",
      wiki: "kyoto",
      answer: { lat: 35, lon: 135.8 },
      shape: { type: RevealedShapeType.POINT }
    })
  })

  it("is an area's centre, with its outline", () => {
    const outline: Outline = [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0]
        ]
      ]
    ]
    const country: Question = {
      type: QuestionType.COUNTRY,
      id: questionId("square-region"),
      place: placeId("square"),
      label: "Square",
      wiki: wikiTitle("Square"),
      clue: { type: ClueType.NAME, prompt: "Paint the whole of Square" },
      answer: {
        type: AnswerType.AREA,
        outline: outlineId("square-region"),
        centre: { lat: 0.5, lon: 0.5 },
        tolerance: 20,
        surface: Surface.LAND
      }
    }
    expect(revealedFromQuestion(country, new Map([[outlineId("square-region"), outline]]))).toMatchObject({
      answer: { lat: 0.5, lon: 0.5 },
      shape: { type: RevealedShapeType.AREA, outline }
    })
  })
})
