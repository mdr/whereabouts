/** Scoring a finished round for everyone who played it. */
import type { RoundResultView } from "../protocol.ts"
import type { Outlines } from "../questions.ts"
import { scoredAnswer } from "../scoring/regions.ts"
import { scoreRound } from "../scoring/round-scoring.ts"
import type { Kernel } from "../scoring/scoring.ts"
import type { Ms } from "../units.ts"
import type { Player } from "./seats.ts"
import { rankAmong } from "./standings.ts"
import type { GuessingState } from "./state.ts"

export function scorePlayers(
  playing: readonly Player[],
  { round, deadline, submissions, hints }: GuessingState,
  { outlines, kernel, roundLength }: { outlines: Outlines; kernel: Kernel; roundLength: Ms }
): RoundResultView[] {
  const { index, question } = round
  const answer = scoredAnswer(question.answer, outlines)
  // Snapshot ranks before any score changes so arrows compare like with like.
  for (const p of playing) p.previousRank = rankAmong(p, playing)
  const timing = { startedAt: deadline - roundLength, roundLength }
  const results: RoundResultView[] = []
  for (const p of playing) {
    if (p.joinedRound > index) continue
    const { score, guess, facts } = scoreRound(question.label, answer, submissions.get(p.token), kernel, timing)
    p.scores[index] = score
    p.facts[index] = facts
    const hint = hints.get(p.token)
    results.push({ playerId: p.id, score, guess, ...(hint ? { hint } : {}) })
  }
  return results.sort((a, b) => b.score - a.score)
}
