/** Totals, ranks and the player list, worked out from the players' scores. */
import type { PlayerFacts } from "../awards/player-facts.ts"
import type { PlayerToken } from "../ids.ts"
import type { Points } from "../units.ts"
import type { FinalStanding } from "../protocol/views.ts"
import { Role, type PlayingPlayerView, type SpectatorView } from "../roles.ts"
import { isPlayer, type PlayerSeat, type Seat } from "./seats.ts"

/** The sum of the scores; a round not played counts as 0. */
const total = (scores: (Points | undefined)[]): Points => {
  let sum = 0
  for (const score of scores) sum += score ?? 0
  return sum
}

/** 1 plus the number of players ahead on total, so ties share a rank. */
export const rankAmong = (player: PlayerSeat, playing: readonly PlayerSeat[]): number => {
  const mine = total(player.role.record.scores)
  let rank = 1
  for (const seat of playing) if (total(seat.role.record.scores) > mine) rank++
  return rank
}

/** Each player's total and per-round scores, best first; `{}` for a round not played. */
export const finalStandings = (playing: readonly PlayerSeat[], roundCount: number): FinalStanding[] =>
  playing
    .map((seat) => ({
      playerId: seat.id,
      name: seat.name,
      colour: seat.role.colour,
      total: total(seat.role.record.scores),
      rounds: Array.from({ length: roundCount }, (_, i) => {
        const score = seat.role.record.scores[i]
        return score === undefined ? {} : { score }
      })
    }))
    .sort((a, b) => b.total - a.total)

export const awardFacts = (playing: readonly PlayerSeat[], roundCount: number): PlayerFacts[] =>
  playing.map((seat) => ({
    playerId: seat.id,
    rounds: Array.from({ length: roundCount }, (_, i) => seat.role.record.facts[i])
  }))

/** Players by rank then name, and spectators by name. */
export const rosterView = (
  seats: readonly Seat[],
  host: PlayerToken | undefined,
  isLocked: (token: PlayerToken) => boolean
): { players: PlayingPlayerView[]; spectators: SpectatorView[] } => {
  const playing = seats.filter(isPlayer)
  const base = (seat: Seat) => ({
    id: seat.id,
    name: seat.name,
    connected: seat.connected,
    isHost: seat.token === host
  })
  return {
    players: playing
      .map((seat): PlayingPlayerView => ({
        ...base(seat),
        type: Role.PLAYER,
        colour: seat.role.colour,
        locked: isLocked(seat.token),
        score: total(seat.role.record.scores),
        rank: rankAmong(seat, playing),
        previousRank: seat.role.record.previousRank
      }))
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)),
    spectators: seats
      .filter((seat) => seat.role.type === Role.SPECTATOR)
      .map((seat): SpectatorView => ({ ...base(seat), type: Role.SPECTATOR }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }
}
