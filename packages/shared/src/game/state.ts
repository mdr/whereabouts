/** What a game holds in each phase, and nothing it doesn't. */
import type { Award } from "../awards/player-facts.ts"
import type { HintAxis } from "../hints.ts"
import type { PlayerToken } from "../ids.ts"
import { Phase, type FinalStanding, type PlayedRound, type RoundReveal } from "../protocol/views.ts"
import type { Question } from "../questions.ts"
import { SubmissionType, type Submission } from "../scoring/round-scoring.ts"
import type { Instant } from "../units.ts"
import type { PlayerRole } from "./seats.ts"

/** One of the game's rounds: where it falls and what it asks. */
export interface Round {
  index: number
  question: Question
}

export interface LobbyState {
  phase: Phase.LOBBY
}

export interface GuessingState {
  phase: Phase.GUESSING
  round: Round
  deadline: Instant
  submissions: Map<PlayerToken, Submission>
  /** The hint each player used on this round. */
  hints: Map<PlayerToken, HintAxis>
}

export interface RevealState {
  phase: Phase.REVEAL
  round: Round
  /** Built once: the server sends it once per connection, by identity. */
  reveal: RoundReveal
  /** Who had locked in when the round ended. */
  lockedIn: ReadonlySet<PlayerToken>
  hints: ReadonlyMap<PlayerToken, HintAxis>
  ready: Set<PlayerToken>
}

export interface ResultsState {
  phase: Phase.RESULTS
  standings: FinalStanding[]
  awards: Award[]
  playedRounds: PlayedRound[]
}

export type GameState = LobbyState | GuessingState | RevealState | ResultsState
export type InPlayState = GuessingState | RevealState

export const LOBBY_STATE: LobbyState = { phase: Phase.LOBBY }

export const isLocked = (submission: Submission | undefined): boolean => submission?.type === SubmissionType.LOCKED

/** Locked in on the round under way, or on show. */
export function lockedIn(state: GameState, token: PlayerToken): boolean {
  switch (state.phase) {
    case Phase.GUESSING:
      return isLocked(state.submissions.get(token))
    case Phase.REVEAL:
      return state.lockedIn.has(token)
    case Phase.LOBBY:
    case Phase.RESULTS:
      return false
  }
}

/** The first round index a player seated now may play. */
export function joiningRound(state: GameState): number {
  switch (state.phase) {
    case Phase.LOBBY:
      return 0
    case Phase.GUESSING:
    case Phase.REVEAL:
      return state.round.index + 1
    case Phase.RESULTS:
      return state.playedRounds.length
  }
}

/** Whether a player plays this round, rather than sitting it out. */
export const playsRound = (role: PlayerRole, round: Round): boolean => role.record.joinedRound <= round.index
