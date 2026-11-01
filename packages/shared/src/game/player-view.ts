import type { HintBand } from "../hints.ts"
import type { PlayerId, PlayerToken, RoomCode } from "../ids.ts"
import type { Question } from "../questions.ts"
import type { GameConfig } from "../protocol/config.ts"
import { Phase, type GameView } from "../protocol/views.ts"
import type { Instant } from "../units.ts"
import { roundHintBand, roundView, upcomingOf } from "./question-views.ts"
import type { Seats } from "./seats.ts"
import { rosterView } from "./standings.ts"
import { lockedIn, type GameState, type InPlayState } from "./state.ts"
import { roundRole, seatedRole } from "./you-view.ts"

export interface ViewContext {
  code: RoomCode
  config: GameConfig
  seed: number
  questions: readonly Question[]
}

/** A view for a seated token; undefined for one with no seat (removed, left, or turned away). */
export function playerView(
  context: ViewContext,
  seats: Seats,
  state: GameState,
  token: PlayerToken,
  now: Instant
): GameView | undefined {
  const { questions } = context
  const seat = seats.get(token)
  if (!seat) return undefined
  const base = {
    code: context.code,
    config: context.config,
    serverTime: now,
    ...rosterView(seats.all(), seats.effectiveHost(), (seatToken) => lockedIn(state, seatToken))
  }
  const you = { id: seat.id, name: seat.name, isHost: seats.isHost(token), ...nextHostView(seats, token) }
  switch (state.phase) {
    case Phase.LOBBY:
      return {
        ...base,
        phase: Phase.LOBBY,
        you: { ...you, role: seatedRole(seat) },
        ...upcomingOf(questions[0])
      }
    case Phase.GUESSING: {
      const paint = state.submissions.get(token)?.paint
      return {
        ...base,
        phase: Phase.GUESSING,
        you: {
          ...you,
          role: roundRole(state, seat, context.config.hints),
          ...hintView(context, state, token),
          ...(paint ? { paint } : {})
        },
        round: roundView(state.round.question, state.round.index, questions.length, state.deadline),
        ...upcomingOf(questions[state.round.index + 1])
      }
    }
    case Phase.REVEAL:
      return {
        ...base,
        phase: Phase.REVEAL,
        you: { ...you, role: roundRole(state, seat, context.config.hints), ...hintView(context, state, token) },
        reveal: { ...state.reveal, ready: readyIds(seats, state.ready) },
        ...upcomingOf(questions[state.round.index + 1])
      }
    case Phase.RESULTS:
      return {
        ...base,
        phase: Phase.RESULTS,
        you: { ...you, role: seatedRole(seat) },
        results: state.standings,
        playedRounds: state.playedRounds,
        awards: state.awards
      }
  }
}

function nextHostView(seats: Seats, token: PlayerToken): { nextHost?: PlayerId } {
  const nextHost = seats.nextHost(token)
  return nextHost ? { nextHost } : {}
}

/** This player's hint band on the round played or revealed. */
function hintView(context: ViewContext, state: InPlayState, token: PlayerToken): { hint?: HintBand } {
  const axis = state.hints.get(token)
  return axis ? { hint: roundHintBand(state.round.question, context.seed, state.round.index, axis) } : {}
}

function readyIds(seats: Seats, ready: ReadonlySet<PlayerToken>): PlayerId[] {
  return [...ready].flatMap((token) => seats.get(token)?.id ?? [])
}
