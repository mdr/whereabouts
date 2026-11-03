import { MilestoneType, type Milestone } from "@whereabouts/shared/game/milestones"
import type { Ms } from "@whereabouts/shared/units"
import type { Logger } from "pino"
import { logEvent } from "./log-event.ts"
import { LOG_CODES } from "./log-codes.ts"
import { GameOutcome } from "./metric-labels.ts"
import type { Metrics } from "./metrics.ts"

/** Log a game's milestone, and count it. `gameMs` is how long the game has run, if the room saw it start. */
export const recordMilestone = (milestone: Milestone, log: Logger, metrics: Metrics, gameMs: Ms | undefined): void => {
  switch (milestone.type) {
    case MilestoneType.GAME_STARTED:
      metrics.countGameStarted(milestone.playerCount)
      logEvent(
        log,
        LOG_CODES.game.started,
        `game started: ${milestone.playerCount} players, ${milestone.rounds} rounds`,
        {
          playerCount: milestone.playerCount,
          rounds: milestone.rounds,
          mix: milestone.mix
        }
      )
      return
    case MilestoneType.ROUND_STARTED:
      metrics.countRound(milestone.questionType)
      logEvent(log, LOG_CODES.round.started, `round ${milestone.index + 1} started`, {
        index: milestone.index,
        questionId: milestone.questionId,
        questionType: milestone.questionType
      })
      return
    case MilestoneType.ROUND_REVEALED:
      logEvent(log, LOG_CODES.round.revealed, `round ${milestone.index + 1} revealed`, {
        index: milestone.index,
        painted: milestone.painted,
        passed: milestone.passed,
        missing: milestone.missing
      })
      return
    case MilestoneType.GAME_ENDED:
      metrics.countGameEnded(milestone.completed ? GameOutcome.FINISHED : GameOutcome.ENDED_EARLY, gameMs)
      logEvent(log, LOG_CODES.game.ended, milestone.completed ? "game finished" : "game ended early", {
        completed: milestone.completed,
        roundsPlayed: milestone.roundsPlayed,
        playerCount: milestone.playerCount
      })
      return
  }
}
