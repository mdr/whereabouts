/** Scoring a finished round for everyone who played it. */
import type { RoundResultView } from "../protocol/views.ts"
import type { Outlines } from "../questions.ts"
import { scoredAnswer } from "../scoring/regions.ts"
import { scoreRound } from "../scoring/round-scoring.ts"
import type { Kernel } from "../scoring/scoring.ts"
import type { Ms } from "../units.ts"
import type { PlayerSeat } from "./seats.ts"
import { rankAmong } from "./standings.ts"
import { playsRound, type GuessingState } from "./state.ts"

export const scorePlayers = (
  playing: readonly PlayerSeat[],
  { round, deadline, submissions, hints }: GuessingState,
  { outlines, kernel, roundLength }: { outlines: Outlines; kernel: Kernel; roundLength: Ms }
): RoundResultView[] => {
  const { index, question } = round
  const answer = scoredAnswer(question.answer, outlines)
  // Snapshot ranks before any score changes so arrows compare like with like.
  for (const seat of playing) seat.role.record.previousRank = rankAmong(seat, playing)
  const timing = { startedAt: deadline - roundLength, roundLength }
  const results: RoundResultView[] = []
  for (const seat of playing) {
    if (!playsRound(seat.role, round)) continue
    const { score, guess, facts } = scoreRound(question.label, answer, submissions.get(seat.token), kernel, timing)
    seat.role.record.scores[index] = score
    seat.role.record.facts[index] = facts
    const hint = hints.get(seat.token)
    results.push({ playerId: seat.id, score, guess, ...(hint ? { hint } : {}) })
  }
  return results.sort((a, b) => b.score - a.score)
}
