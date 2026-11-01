import type { PlayerId } from "../ids.ts"
import type { PlayerFacts } from "./player-facts.ts"
import { GAME_RULES } from "./rules/game-rules.ts"
import { HABIT_RULES } from "./rules/habit-rules.ts"
import { ROUND_RULES } from "./rules/round-rules.ts"
import { painted, type Candidate, type Context, type Rule } from "./rules/rule-kit.ts"

const RULES: Rule[] = [...ROUND_RULES, ...HABIT_RULES, ...GAME_RULES]

/** Every award someone earned, prizes and booby prizes alike. */
export const candidateAwards = (players: PlayerFacts[]): Candidate[] => {
  const rounds = players.flatMap((player) => painted(player).map((round) => ({ player, round })))
  const ranks = rankHistory(players, Math.max(0, ...players.map((player) => player.rounds.length)))
  const ctx: Context = { players, rounds, ranks, final: ranks.at(-1) }
  return RULES.flatMap((rule) => rule(ctx) ?? [])
}

const rankHistory = (players: PlayerFacts[], rounds: number): Map<PlayerId, number>[] => {
  const running = new Map(players.map((player) => [player.playerId, 0]))
  const out: Map<PlayerId, number>[] = []
  for (let round = 0; round < rounds; round++) {
    for (const player of players)
      running.set(player.playerId, running.get(player.playerId)! + (player.rounds[round]?.score ?? 0))
    const ranks = new Map<PlayerId, number>()
    for (const [id, score] of running) ranks.set(id, 1 + [...running.values()].filter((other) => other > score).length)
    out.push(ranks)
  }
  return out
}
