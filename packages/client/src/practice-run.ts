/**
 * A practice run: the questions in shuffled order, where the player is in
 * them, and what each round scored. Pure, so Solo.tsx is only the view over
 * it; each step returns a new run.
 */
import type { Distribution, Kernel } from "@whereabouts/shared/scoring"
import { scoreAnswer, type ScoredAnswer } from "@whereabouts/shared/regions"
import { AnswerType, answerCentre, shuffle, type Outlines, type Question } from "@whereabouts/shared/questions"
import { revealPhoto } from "@whereabouts/shared/photos"
import type { VrTable } from "./vr/scores"
import type { RevealedAnswer } from "./round"

export enum PracticePhase {
  PAINT = "PAINT",
  REVEAL = "REVEAL",
  DONE = "DONE"
}

export interface PracticeResult {
  question: Question
  score: number
}

export interface PracticeRun {
  questions: Question[]
  index: number
  phase: PracticePhase
  /** In the order played. */
  results: PracticeResult[]
  /** The round on show at the reveal; no distribution for a pass. */
  revealed?: { dist?: Distribution; result: PracticeResult }
}

/** The whole pool, shuffled by `seed`, from its first question. */
export function startRun(pool: readonly Question[], seed: number): PracticeRun {
  return { questions: shuffle([...pool], seed), index: 0, phase: PracticePhase.PAINT, results: [] }
}

export const currentQuestion = (run: PracticeRun): Question => run.questions[run.index]!

export const isLastRound = (run: PracticeRun): boolean => run.index + 1 >= run.questions.length

export const runTotal = (run: PracticeRun): number => run.results.reduce((s, r) => s + r.score, 0)

/** The best a run could score: a thousand a question. */
export const runMaximum = (run: PracticeRun): number => run.questions.length * 1000

/** Score the paint (undefined for a pass) against the current question, and show the reveal. */
export function submitRound(
  run: PracticeRun,
  dist: Distribution | undefined,
  answer: ScoredAnswer,
  kernel: Kernel
): PracticeRun {
  const result = { question: currentQuestion(run), score: scoreAnswer(dist, answer, kernel).score }
  return { ...run, phase: PracticePhase.REVEAL, results: [...run.results, result], revealed: { dist, result } }
}

/** On from a reveal: the next question, or the end of the run after the last. */
export function nextRound(run: PracticeRun): PracticeRun {
  if (isLastRound(run)) return { ...run, phase: PracticePhase.DONE }
  return { ...run, index: run.index + 1, phase: PracticePhase.PAINT }
}

export function revealedFromQuestion(q: Question, outlines: Outlines): RevealedAnswer {
  return {
    label: q.label,
    wiki: q.wiki,
    answer: answerCentre(q.answer),
    outline: q.answer.type === AnswerType.AREA ? outlines.get(q.answer.outline) : undefined,
    photo: revealPhoto(q)
  }
}

/** The rounds so far, latest first, for the headset's score table. */
export function roundsTable(results: readonly PracticeResult[]): VrTable {
  return {
    title: "Your rounds",
    rows: results
      .map((r, i) => ({ name: `${i + 1}. ${r.question.label}`, total: Math.round(r.score).toLocaleString() }))
      .reverse()
  }
}
