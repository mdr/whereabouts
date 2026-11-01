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
