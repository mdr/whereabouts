/** Totals, ranks and the player list, worked out from the players' scores. */
import type { PlayerFacts } from "../awards/awards.ts"
import type { PlayerToken } from "../ids.ts"
import type { Points } from "../units.ts"
import type { FinalStanding, PlayerView } from "../protocol.ts"
import { isPlayer, type PlayerSeat, type Seat } from "./seats.ts"

/** The sum of the scores; a round not played counts as 0. */
function total(scores: (Points | undefined)[]): Points {
  let t = 0
  for (const x of scores) t += x ?? 0
  return t
}

/** 1 plus the number of players ahead on total, so ties share a rank. */
export function rankAmong(player: PlayerSeat, playing: readonly PlayerSeat[]): number {
  const mine = total(player.role.record.scores)
  let rank = 1
  for (const p of playing) if (total(p.role.record.scores) > mine) rank++
  return rank
}

/** Each player's total and per-round scores, best first; `{}` for a round not played. */
export function finalStandings(playing: readonly PlayerSeat[], roundCount: number): FinalStanding[] {
  return playing
    .map((p) => ({
      playerId: p.id,
      total: total(p.role.record.scores),
      rounds: Array.from({ length: roundCount }, (_, i) => {
        const score = p.role.record.scores[i]
        return score === undefined ? {} : { score }
      })
    }))
    .sort((a, b) => b.total - a.total)
}

export function awardFacts(playing: readonly PlayerSeat[], roundCount: number): PlayerFacts[] {
  return playing.map((p) => ({
    playerId: p.id,
    rounds: Array.from({ length: roundCount }, (_, i) => p.role.record.facts[i])
  }))
}

/** Players ranked first, then spectators, by name within a rank. */
export function playerViews(
  seats: readonly Seat[],
  host: PlayerToken | undefined,
  isLocked: (token: PlayerToken) => boolean
): PlayerView[] {
  const playing = seats.filter(isPlayer)
  return seats
    .map((s): PlayerView => {
      const base = {
        id: s.id,
        name: s.name,
        connected: s.connected,
        isHost: s.token === host,
        locked: isLocked(s.token)
      }
      // Spectators are unranked (0) and listed after the players.
      if (!isPlayer(s))
        return { ...base, colour: undefined, watching: true, score: 0, rank: 0, previousRank: undefined }
      const { record } = s.role
      return {
        ...base,
        colour: s.role.colour,
        watching: false,
        score: total(record.scores),
        rank: rankAmong(s, playing),
        previousRank: record.previousRank
      }
    })
    .sort((a, b) => Number(a.watching) - Number(b.watching) || a.rank - b.rank || a.name.localeCompare(b.name))
}
