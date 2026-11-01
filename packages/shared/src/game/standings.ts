/** Totals, ranks and the player list, worked out from the players' scores. */
import type { PlayerFacts } from "../awards/awards.ts"
import type { PlayerToken } from "../ids.ts"
import type { FinalStanding, PlayerView } from "../protocol.ts"
import type { Player } from "./seats.ts"

/** The sum of the scores; a round not played counts as 0. */
function total(scores: (number | undefined)[]): number {
  let t = 0
  for (const x of scores) t += x ?? 0
  return t
}

/** 1 plus the number of players ahead on total, so ties share a rank. */
export function rankAmong(player: Player, playing: readonly Player[]): number {
  const mine = total(player.scores)
  let rank = 1
  for (const p of playing) if (total(p.scores) > mine) rank++
  return rank
}

/** Each player's total and per-round scores, best first; `{}` for a round not played. */
export function finalStandings(playing: readonly Player[], roundCount: number): FinalStanding[] {
  return playing
    .map((p) => ({
      playerId: p.id,
      total: total(p.scores),
      rounds: Array.from({ length: roundCount }, (_, i) => {
        const score = p.scores[i]
        return score === undefined ? {} : { score }
      })
    }))
    .sort((a, b) => b.total - a.total)
}

export function awardFacts(playing: readonly Player[], roundCount: number): PlayerFacts[] {
  return playing.map((p) => ({
    playerId: p.id,
    rounds: Array.from({ length: roundCount }, (_, i) => p.facts[i])
  }))
}

/** Players ranked first, then spectators, by name within a rank. */
export function playerViews(
  players: readonly Player[],
  host: PlayerToken | undefined,
  isLocked: (token: PlayerToken) => boolean
): PlayerView[] {
  const playing = players.filter((p) => !p.watching)
  return players
    .map((p) => ({
      id: p.id,
      name: p.name,
      colour: p.colour,
      watching: p.watching,
      connected: p.connected,
      isHost: p.token === host,
      locked: isLocked(p.token),
      score: total(p.scores),
      // Spectators are unranked (0) and listed after the players.
      rank: p.watching ? 0 : rankAmong(p, playing),
      previousRank: p.previousRank
    }))
    .sort((a, b) => Number(a.watching) - Number(b.watching) || a.rank - b.rank || a.name.localeCompare(b.name))
}
