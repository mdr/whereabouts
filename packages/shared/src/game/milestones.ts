/** The turning points of a game, found by comparing it before and after a change. */
import type { QuestionMix } from "../protocol/config.ts"
import { Phase } from "../protocol/views.ts"
import type { QuestionId } from "../ids.ts"
import type { QuestionType } from "../questions.ts"

/** How a round's players answered: every player is one of these. */
export interface RevealTally {
  painted: number
  /** Pressed Done with nothing painted. */
  passed: number
  /** Never locked in. */
  missing: number
}

/** Just enough of a game to tell what happened between two looks at it. */
export interface GameSnapshot {
  phase: Phase
  /** The round being guessed or revealed. */
  roundIndex: number | undefined
  question: { id: QuestionId; type: QuestionType } | undefined
  /** On a reveal. */
  tally: RevealTally | undefined
  /** On the results. */
  roundsPlayed: number | undefined
  totalRounds: number
  /** Not counting spectators. */
  playerCount: number
  mix: QuestionMix
}

export enum MilestoneType {
  GAME_STARTED = "GAME_STARTED",
  ROUND_STARTED = "ROUND_STARTED",
  ROUND_REVEALED = "ROUND_REVEALED",
  GAME_ENDED = "GAME_ENDED"
}

interface GameStarted {
  type: MilestoneType.GAME_STARTED
  playerCount: number
  rounds: number
  mix: QuestionMix
}

interface RoundStarted {
  type: MilestoneType.ROUND_STARTED
  index: number
  questionId: QuestionId
  questionType: QuestionType
}

interface RoundRevealed extends RevealTally {
  type: MilestoneType.ROUND_REVEALED
  index: number
}

interface GameEnded {
  type: MilestoneType.GAME_ENDED
  /** Every round was played, rather than the host ending it early. */
  completed: boolean
  roundsPlayed: number
  playerCount: number
}

export type Milestone = GameStarted | RoundStarted | RoundRevealed | GameEnded

/** What a change did, in order; nothing unless the game moved to another phase or round. */
export const milestones = (before: GameSnapshot, after: GameSnapshot): Milestone[] => {
  if (before.phase === after.phase && before.roundIndex === after.roundIndex) return []
  const found: Milestone[] = []
  if (before.phase === Phase.LOBBY && after.phase !== Phase.LOBBY)
    found.push({
      type: MilestoneType.GAME_STARTED,
      playerCount: after.playerCount,
      rounds: after.totalRounds,
      mix: after.mix
    })
  if (after.phase === Phase.GUESSING && after.roundIndex !== undefined && after.question)
    found.push({
      type: MilestoneType.ROUND_STARTED,
      index: after.roundIndex,
      questionId: after.question.id,
      questionType: after.question.type
    })
  if (after.phase === Phase.REVEAL && after.roundIndex !== undefined && after.tally)
    found.push({ type: MilestoneType.ROUND_REVEALED, index: after.roundIndex, ...after.tally })
  if (after.phase === Phase.RESULTS && before.phase !== Phase.RESULTS) {
    const roundsPlayed = after.roundsPlayed ?? 0
    found.push({
      type: MilestoneType.GAME_ENDED,
      completed: roundsPlayed === after.totalRounds,
      roundsPlayed,
      playerCount: after.playerCount
    })
  }
  return found
}
