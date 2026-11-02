import type { Points } from "@whereabouts/shared/units"
/**
 * A practice run: the questions in shuffled order, where the player is in
 * them, and what each round scored. Pure, so Solo.tsx is only the view over
 * it; each step returns a new run.
 */
import type { Distribution, Kernel } from "@whereabouts/shared/scoring/scoring"
import { scoreAnswer, type ScoredAnswer } from "@whereabouts/shared/scoring/regions"
import { answerCentre, shuffle, type Outlines, type Question } from "@whereabouts/shared/questions"
import { revealPhoto } from "@whereabouts/shared/catalogue/photos"
import type { VrTable } from "../vr/scores/scores"
import type { RevealedAnswer } from "./round"
import { revealedShape } from "./revealed-shape"

export enum PracticePhase {
  PAINT = "PAINT",
  REVEAL = "REVEAL",
  DONE = "DONE"
}

export interface PracticeResult {
  question: Question
  score: Points
}

interface RunBase {
  questions: Question[]
  index: number
  /** In the order played. */
  results: PracticeResult[]
}

export interface PaintingRun extends RunBase {
  type: PracticePhase.PAINT
}

export interface RevealingRun extends RunBase {
  type: PracticePhase.REVEAL
  /** The round on show; no distribution for a pass. */
  revealed: { painted?: Distribution; result: PracticeResult }
}

export interface DoneRun extends RunBase {
  type: PracticePhase.DONE
}

export type PracticeRun = PaintingRun | RevealingRun | DoneRun

/** The whole pool, shuffled by `seed`, from its first question. */
export const startRun = (pool: readonly Question[], seed: number): PaintingRun => ({
  type: PracticePhase.PAINT,
  questions: shuffle([...pool], seed),
  index: 0,
  results: []
})

export const currentQuestion = (run: PracticeRun): Question => run.questions[run.index]!

export const isLastRound = (run: PracticeRun): boolean => run.index + 1 >= run.questions.length

export const runTotal = (run: PracticeRun): number => run.results.reduce((total, result) => total + result.score, 0)

/** The best a run could score: a thousand a question. */
export const runMaximum = (run: PracticeRun): number => run.questions.length * 1000

/** Score the paint (undefined for a pass) against the current question, and show the reveal. */
export const submitRound = (
  run: PaintingRun,
  painted: Distribution | undefined,
  answer: ScoredAnswer,
  kernel: Kernel
): RevealingRun => {
  const result = { question: currentQuestion(run), score: scoreAnswer(painted, answer, kernel).score }
  return { ...run, type: PracticePhase.REVEAL, results: [...run.results, result], revealed: { painted, result } }
}

/** On from a reveal: the next question, or the end of the run after the last. */
/** What moving on from the reveal is called, on the page and in the headset. */
export const nextLabel = (run: PracticeRun): string => (isLastRound(run) ? "Finish" : "Next question")

export const nextRound = (run: RevealingRun): PaintingRun | DoneRun => {
  const { questions, index, results } = run
  if (isLastRound(run)) return { type: PracticePhase.DONE, questions, index, results }
  return { type: PracticePhase.PAINT, questions, index: index + 1, results }
}

export const revealedFromQuestion = (question: Question, outlines: Outlines): RevealedAnswer => ({
  label: question.label,
  wiki: question.wiki,
  answer: answerCentre(question.answer),
  shape: revealedShape(question.answer, outlines),
  photo: revealPhoto(question)
})

/** The rounds so far, latest first, for the headset's score table. */
export const roundsTable = (results: readonly PracticeResult[]): VrTable => ({
  title: "Your rounds",
  rows: results
    .map((result, i) => ({
      name: `${i + 1}. ${result.question.label}`,
      total: Math.round(result.score).toLocaleString()
    }))
    .reverse()
})
