import { MilestoneType, type Milestone } from "@whereabouts/shared/game/milestones"
import type { Logger } from "pino"
import { LogEvent, logEvent } from "./log-event.ts"
import type { Metrics } from "./metrics.ts"

/** Log a game's milestone, and count it. */
export const recordMilestone = (milestone: Milestone, log: Logger, metrics: Metrics): void => {
  switch (milestone.type) {
    case MilestoneType.GAME_STARTED:
      metrics.gamesStarted.inc()
      logEvent(log, LogEvent.GAME_STARTED, {
        playerCount: milestone.playerCount,
        rounds: milestone.rounds,
        mix: milestone.mix
      })
      return
    case MilestoneType.ROUND_STARTED:
      metrics.rounds.inc({ type: milestone.questionType })
      logEvent(log, LogEvent.ROUND_STARTED, {
        index: milestone.index,
        questionId: milestone.questionId,
        questionType: milestone.questionType
      })
      return
    case MilestoneType.ROUND_REVEALED:
      logEvent(log, LogEvent.ROUND_REVEALED, {
        index: milestone.index,
        painted: milestone.painted,
        passed: milestone.passed,
        missing: milestone.missing
      })
      return
    case MilestoneType.GAME_ENDED:
      metrics.gamesEnded.inc({ completed: String(milestone.completed) })
      logEvent(log, LogEvent.GAME_ENDED, {
        completed: milestone.completed,
        roundsPlayed: milestone.roundsPlayed,
        playerCount: milestone.playerCount
      })
      return
  }
}
