/** Scoring one player's round: the score, its parts, and the facts the awards read. */
import { FactsType, type RoundFacts } from "../awards/awards.ts"
import { explainPoint, isHedge } from "./explain.ts"
import { PaintLayer, resolutionForTolerance } from "../paint/paint.ts"
import type { PaintSubmission, ScoreParts } from "../protocol.ts"
import { AnswerType } from "../questions.ts"
import { regionFit, regionMisfit, scoreAnswer, type AnswerParts, type ScoredAnswer } from "./regions.ts"
import { buildDistribution, type Distribution, type Kernel } from "./scoring.ts"
import type { Instant, Ms } from "../units.ts"

export enum SubmissionType {
  DRAFT = "DRAFT",
  LOCKED = "LOCKED"
}

interface DraftSubmission {
  type: SubmissionType.DRAFT
  paint: PaintSubmission
}

interface LockedSubmission {
  type: SubmissionType.LOCKED
  paint: PaintSubmission
  /** When the player locked in. */
  at: Instant
}

/** A player's guess on a round. */
export type Submission = DraftSubmission | LockedSubmission

export interface ScoredRound {
  score: number
  parts: ScoreParts
  facts: RoundFacts
  /** Undefined for a pass. */
  paint?: PaintSubmission
}

/**
 * Score `submission` against `answer`. No submission, or an empty one, is a
 * pass; so is a blank map at the deadline, so waiting out the clock never
 * beats pressing Pass.
 */
export function scoreRound(
  label: string,
  answer: ScoredAnswer,
  submission: Submission | undefined,
  kernel: Kernel,
  { startedAt, roundLength }: { startedAt: Instant; roundLength: Ms }
): ScoredRound {
  const painted = submission && Object.keys(submission.paint.cells).length > 0 ? submission.paint : undefined
  const res = resolutionForTolerance(answer.tolerance)
  const cells = painted ? [...PaintLayer.fromRecord(res, painted.cells).toCells()] : []
  const dist = painted ? buildDistribution(cells, painted.floor) : undefined
  const { score, parts: answerParts } = scoreAnswer(dist, answer, kernel)
  const parts = resultParts(answerParts, dist, answer)
  const base = {
    label,
    score,
    lockedAfter: submission?.type === SubmissionType.LOCKED ? submission.at - startedAt : undefined,
    roundLength
  }
  if (!painted || !dist) return { score, parts, facts: { type: FactsType.PASSED, ...base } }
  const area = cells.reduce((a, c) => a + c.area, 0)
  if (answer.type === AnswerType.AREA) {
    const m = regionMisfit(dist, answer)
    // A country's tolerance is a fifth of its equivalent radius.
    const region = {
      precision: m.precision,
      nextDoor: m.precision < 0.1 && m.off !== undefined && m.off.distance < 5 * answer.tolerance
    }
    return { score, parts, facts: { type: FactsType.AREA, ...base, area, region }, paint: painted }
  }
  if (parts.type !== AnswerType.POINT) throw new Error("area parts for a point answer")
  const e = explainPoint(dist, answer.at, answer.tolerance, parts.A, parts.B, kernel)
  const best = Math.max(e.best, score)
  const point = {
    spot: e.spot,
    miss: e.miss,
    spread: 1000 - best,
    missCost: best - score,
    hedged: isHedge(e, score, answer.tolerance),
    tolerance: answer.tolerance
  }
  return { score, parts, facts: { type: FactsType.POINT, ...base, area, point }, paint: painted }
}

/** A result's parts: a painted area answer's add how the paint sat against the outline. */
function resultParts(parts: AnswerParts, dist: Distribution | undefined, answer: ScoredAnswer): ScoreParts {
  if (parts.type === AnswerType.POINT) return parts
  if (!dist || answer.type !== AnswerType.AREA) throw new Error("area parts without an area paint")
  return { ...parts, ...regionFit(dist, answer) }
}
