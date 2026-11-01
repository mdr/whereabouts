/** Who is in a game and what part they play, as the views show it. */
import type { PlayerColour } from "./colours.ts"
import type { PlayerId, PlayerName } from "./ids.ts"
import type { Points } from "./units.ts"

/** A seat's part: plays, or watches every round. */
export enum Role {
  PLAYER = "PLAYER",
  SPECTATOR = "SPECTATOR"
}

interface SeatViewBase {
  id: PlayerId
  name: PlayerName
  connected: boolean
  isHost: boolean
}

export interface PlayingPlayerView extends SeatViewBase {
  type: Role.PLAYER
  colour: PlayerColour
  /** Has frozen their guess this round. */
  locked: boolean
  /** Total so far. */
  score: Points
  /** 1-based by total; ties share a rank. */
  rank: number
  /** At the end of the previous round, for change arrows. */
  previousRank?: number
}

/** Watches every round: no colour, no score, never waited on. */
export interface SpectatorView extends SeatViewBase {
  type: Role.SPECTATOR
}

export type PlayerView = PlayingPlayerView | SpectatorView

/** Players, then spectators: everyone in the game. */
export const everyone = (v: { players: PlayingPlayerView[]; spectators: SpectatorView[] }): PlayerView[] => [
  ...v.players,
  ...v.spectators
]

export enum YouRoleType {
  PLAYING = "PLAYING",
  JOINED_LATE = "JOINED_LATE",
  SPECTATOR = "SPECTATOR"
}

interface YouSpectating {
  type: YouRoleType.SPECTATOR
}

/** A player's seat, in the lobby and on the final results. */
interface YouSeated {
  type: YouRoleType.PLAYING
  colour: PlayerColour
}

/** Playing the round under way or on show. */
export interface YouPlaying extends YouSeated {
  locked: boolean
  hintsLeft: number
}

/** Seated mid-round: sits it out and plays from the next. */
interface YouJoinedLate {
  type: YouRoleType.JOINED_LATE
  colour: PlayerColour
}

export type YouRole = YouSeated | YouSpectating
export type RoundYouRole = YouPlaying | YouJoinedLate | YouSpectating
