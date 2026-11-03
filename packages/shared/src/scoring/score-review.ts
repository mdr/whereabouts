/**
 * Made-up guesses at real questions, for the score review (a hidden dev
 * screen) where a playtester says whether scores are fair. Each guess is
 * one kind the scoring has to weigh: on the answer, near it, far off,
 * spread wide, hedged; for a place painted whole, all of it, part of it,
 * spilling over its edge, or its neighbour. Painted in brush strokes, unevenly,
 * as people paint. Most cases are one guess to
 * judge on its own; some are two at the same answer, to say which deserves
 * more. Seeded by the set number, so everyone reviewing a set sees the same.
 */
import { seededUnit } from "../hints.ts"
import type { PaintLayer } from "../paint/paint.ts"
import { AnswerType, ClueType, QuestionType, shuffle, type Outlines, type Question } from "../questions.ts"
import { poolOf } from "../catalogue/catalogue.ts"
import { MapDetail } from "../protocol/config.ts"
import { guessPainter, type ReviewGuess } from "./review-painting.ts"
import { scoreAnswer, scoredAnswer, type ScoredAnswer } from "./regions.ts"
import { CaseQuestionType, RegionKernel, encodeCase, type CaseQuestion, type ScoringCase } from "./scoring-case.ts"
import { buildDistribution, type ChoosableKernel, type Kernel } from "./scoring.ts"
export enum ReviewCaseType {
  SINGLE = "SINGLE",
  PAIR = "PAIR"
}

/** The practice default: what the guesses would score with. */
const REVIEW_FLOOR = 0.05
/** Changes when the same set number would give different cases, so verdicts on the old ones stay apart. */
export const REVIEW_VERSION = 4

interface SingleReviewCase {
  type: ReviewCaseType.SINGLE
  question: Question
  answer: ScoredAnswer
  guess: ReviewGuess
}

interface PairReviewCase {
  type: ReviewCaseType.PAIR
  question: Question
  answer: ScoredAnswer
  guesses: [ReviewGuess, ReviewGuess]
}

export type ReviewCase = SingleReviewCase | PairReviewCase

/** Cases a set holds from each pool: single guesses, then pairs. */
const MIX: [QuestionType[], number, number][] = [
  [[QuestionType.LANDMARK, QuestionType.PLACE], 8, 2],
  [[QuestionType.COUNTRY], 6, 2],
  [[QuestionType.FEATURE], 5, 2],
  [[QuestionType.STATE], 5, 2]
]

export const REVIEW_SET_SIZE = MIX.reduce((total, [, singles, pairs]) => total + singles + pairs, 0)

export const reviewCases = (set: number, catalogue: readonly Question[], outlines: Outlines): ReviewCase[] => {
  const cases: ReviewCase[] = []
  MIX.forEach(([types, singles, pairs], pool) => {
    const questions = shuffle(poolOf(catalogue, types, MapDetail.POLITICAL), set * 7919 + pool).slice(
      0,
      singles + pairs
    )
    questions.forEach((question, i) => {
      let draws = 0
      const random = (): number => seededUnit(set, pool, i, draws++)
      const answer = scoredAnswer(question.answer, outlines)
      const paint = guessPainter(answer, set * 104729 + pool * 31 + i, random)
      if (i < singles) cases.push({ type: ReviewCaseType.SINGLE, question, answer, guess: paint(0) })
      else cases.push({ type: ReviewCaseType.PAIR, question, answer, guesses: [paint(0), paint(1)] })
    })
  })
  return shuffle(cases, set * 15485863)
}

/** A guess's score, as practice would give it. */
export const scoreGuess = (
  answer: ScoredAnswer,
  layer: PaintLayer,
  kernel: Kernel
): Pick<ScoringCase, "score" | "parts"> => scoreAnswer(buildDistribution(layer.toCells(), REVIEW_FLOOR), answer, kernel)

/** A guess and its score as a scoring case's text, for the export. */
export const guessCase = (
  question: Question,
  answer: ScoredAnswer,
  layer: PaintLayer,
  kernel: ChoosableKernel
): Promise<string> =>
  encodeCase({
    question: caseQuestion(question, answer),
    kernel: answer.type === AnswerType.AREA ? RegionKernel.REGION : kernel.id,
    floor: REVIEW_FLOOR,
    resolution: layer.resolution,
    ...scoreGuess(answer, layer, kernel),
    cells: layer.toRecord()
  })

/** A question as a scoring case names it. */
export const caseQuestion = (question: Question, answer: ScoredAnswer): CaseQuestion => ({
  type:
    answer.type === AnswerType.AREA
      ? CaseQuestionType.REGION
      : question.clue.type === ClueType.PHOTO
        ? CaseQuestionType.PHOTO
        : CaseQuestionType.TEXT,
  id: question.id,
  label: question.label,
  answer: answer.type === AnswerType.AREA ? answer.centre : answer.at,
  tolerance: answer.tolerance,
  ...(question.clue.type === ClueType.FLAG ? { flag: question.clue.flag } : {})
})
