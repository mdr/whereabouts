import type { PlayerId } from "../../ids.ts"
import type { Km, Ms, Points } from "../../units.ts"
import {
  FactsType,
  type Award,
  type AreaFacts,
  type PlayerFacts,
  type PointFacts,
  type RoundFacts
} from "../player-facts.ts"

export interface Candidate extends Award {
  booby: boolean
}

export type PaintedFacts = PointFacts | AreaFacts

interface PaintedRound {
  player: PlayerFacts
  round: PaintedFacts
}

/** What the rules share, worked out once. */
export interface Context {
  players: PlayerFacts[]
  rounds: PaintedRound[]
  /** Each player's rank after each round. */
  ranks: Map<PlayerId, number>[]
  /** The ranks after the last round. */
  final: Map<PlayerId, number> | undefined
}

export type Rule = (ctx: Context) => Candidate | undefined

export const prize = (emoji: string, title: string, playerId: PlayerId, line: string): Candidate => ({
  booby: false,
  emoji,
  title,
  playerIds: [playerId],
  line
})

export const booby = (emoji: string, title: string, playerId: PlayerId, line: string): Candidate => ({
  ...prize(emoji, title, playerId, line),
  booby: true
})

/** The end of a round that counts as the last second: 5 s, less in short rounds. */
export const lastSecond = (roundLength: Ms): Ms => Math.min(5000, roundLength / 6)

/** The one player with the highest value, or none on a tie or when nobody qualifies. */
export function top<T>(items: T[], value: (item: T) => number | undefined): { item: T; value: number } | undefined {
  let best: { item: T; value: number } | undefined = undefined
  let tied = false
  for (const item of items) {
    const amount = value(item)
    if (amount === undefined || !Number.isFinite(amount)) continue
    if (!best || amount > best.value) {
      best = { item, value: amount }
      tied = false
    } else if (amount === best.value) tied = true
  }
  return tied ? undefined : best
}

export const played = (player: PlayerFacts) => player.rounds.filter((round): round is RoundFacts => round !== undefined)
export const painted = (player: PlayerFacts) =>
  played(player).filter((round): round is PaintedFacts => round.type !== FactsType.PASSED)
export const pointRounds = (player: PlayerFacts) =>
  played(player).filter((round): round is PointFacts => round.type === FactsType.POINT)
export const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
export const total = (player: PlayerFacts): Points => played(player).reduce((sum, round) => sum + round.score, 0)
export const paintedArea = (player: PlayerFacts) => painted(player).reduce((sum, round) => sum + round.area, 0)
export const byTotal = (players: PlayerFacts[]) => [...players].sort((a, b) => total(b) - total(a))

export const soleLeader = (ranks: Map<PlayerId, number>) =>
  [...ranks.values()].filter((rank) => rank === 1).length === 1

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!
}

export function ordinal(position: number): string {
  const suffix = position % 100 >= 11 && position % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][position % 10] ?? "th")
  return `${position}${suffix}`
}

export function roughDistance(km: Km): string {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(km)) - 1)
  return `${(Math.round(km / step) * step).toLocaleString("en")} km`
}
