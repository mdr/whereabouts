/** Scoring a finished round for everyone who played it. */
import type { PaintSubmission, RoundResultView } from "../protocol/views.ts"
import type { Outlines, Question } from "../questions.ts"
import { scoredAnswer } from "../scoring/regions.ts"
import { scoreRound, SubmissionType, type ScoredRound } from "../scoring/round-scoring.ts"
import type { Kernel } from "../scoring/scoring.ts"
import type { Instant, Ms } from "../units.ts"
import type { PlayerSeat } from "./seats.ts"
import { rankAmong } from "./standings.ts"
import { playsRound, type GuessingState } from "./state.ts"

export interface ScoringContext {
  outlines: Outlines
  kernel: Kernel
  roundLength: Ms | undefined
}

/** One player's round, with this paint, locked in at `lockedAt` or still a draft. */
export const scorePaint = (
  question: Question,
  startedAt: Instant,
  paint: PaintSubmission | undefined,
  lockedAt: Instant | undefined,
  { outlines, kernel, roundLength }: ScoringContext
): ScoredRound =>
  scoreRound(question.label, scoredAnswer(question.answer, outlines), paint, lockedAt, kernel, {
    startedAt,
    roundLength
  })

export const scorePlayers = (
  playing: readonly PlayerSeat[],
  { round, startedAt, submissions, hints }: GuessingState,
  context: ScoringContext
): RoundResultView[] => {
  const { index, question } = round
  // Snapshot ranks before any score changes so arrows compare like with like.
  for (const seat of playing) seat.role.record.previousRank = rankAmong(seat, playing)
  const results: RoundResultView[] = []
  for (const seat of playing) {
    if (!playsRound(seat.role, round)) continue
    const submission = submissions.get(seat.token)
    const { score, guess, facts } =
      submission?.type === SubmissionType.LOCKED
        ? submission.scored
        : scorePaint(question, startedAt, submission?.paint, undefined, context)
    seat.role.record.scores[index] = score
    seat.role.record.facts[index] = facts
    const hint = hints.get(seat.token)
    results.push({
      playerId: seat.id,
      name: seat.name,
      colour: seat.role.colour,
      score,
      guess,
      ...(hint ? { hint } : {})
    })
  }
  return results.sort((a, b) => b.score - a.score)
}
