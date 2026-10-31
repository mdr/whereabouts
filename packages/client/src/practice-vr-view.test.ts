// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { placeId, questionId, wikiTitle } from "@whereabouts/shared/ids"
import { MapDetail } from "@whereabouts/shared/protocol"
import { scoredAnswer } from "@whereabouts/shared/regions"
import { DEFAULT_KERNEL } from "@whereabouts/shared/scoring"
import { AnswerType, ClueType, QuestionType, type PlaceQuestion } from "@whereabouts/shared/questions"
import type { PaintController } from "./paint-controller"
import { nextRound, startRun, submitRound, type PracticeRun } from "./practice-run"
import { practiceVrView, type PracticeVrShown } from "./practice-vr-view"
import { VrViewType, type VrView } from "./vr/view"
import { makeQuestionView } from "./test-view"

const place = (id: string): PlaceQuestion => ({
  type: QuestionType.PLACE,
  id: questionId(id),
  place: placeId(id),
  label: id,
  wiki: wikiTitle(id),
  clue: { type: ClueType.NAME, prompt: `Where is ${id}?` },
  answer: { type: AnswerType.POINT, at: { lat: 35, lon: 135.8 }, tolerance: 50 }
})

const pass = (run: PracticeRun) =>
  submitRound(run, undefined, scoredAnswer(run.questions[run.index]!.answer, new Map()), DEFAULT_KERNEL)

const shown = (over: Partial<PracticeVrShown> = {}): PracticeVrShown => ({
  paint: {} as PaintController,
  question: makeQuestionView(),
  answer: { label: "Kyoto", answer: { lat: 35, lon: 135.8 }, outline: undefined },
  fact: undefined,
  detail: MapDetail.MINIMAL,
  hint: undefined,
  useHint: vi.fn(),
  submit: vi.fn(),
  next: vi.fn(),
  restart: vi.fn(),
  shownScore: undefined,
  where: undefined,
  borders: undefined,
  ...over
})

const run = startRun(["kyoto", "lima"].map(place), 1)

describe("practiceVrView", () => {
  it("heads the round with where you are in the run and your points", () => {
    const v = practiceVrView(run, shown())
    expect(v.type === VrViewType.PAINT && v.round.heading).toBe("QUESTION 1 OF 2, 0 pts")
  })

  it("moves on from a reveal, finishing at the last", () => {
    const action = (r: PracticeRun): string | undefined => {
      const v: VrView = practiceVrView(r, shown({ shownScore: 250 }))
      return v.type === VrViewType.REVEAL ? v.reveal.actions[0]?.label : undefined
    }
    expect(action(pass(run))).toBe("Next question")
    expect(action(pass(nextRound(pass(run))))).toBe("Finish")
  })

  it("sums the run up at the end, out of a thousand a question", () => {
    const done = nextRound(pass(nextRound(pass(run))))
    const v = practiceVrView(done, shown())
    expect(v.type === VrViewType.DONE && v.summary.scoreLine).toBe("500 pts out of 2,000")
  })
})
