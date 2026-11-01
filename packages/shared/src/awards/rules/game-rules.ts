import { greatCircleDistance } from "../../geo.ts"
import type { PlayerId } from "../../ids.ts"
import { FactsType, type PlayerFacts } from "../player-facts.ts"
import { booby, byTotal, mean, ordinal, painted, played, prize, soleLeader, top, total, type Rule } from "./rule-kit.ts"

const comebackKid: Rule = ({ players, ranks, final }) => {
  if (ranks.length < 3 || players.length < 3 || !final) return undefined
  const climbs = players.map((player) => {
    const before = ranks.slice(0, -1).map((roundRanks) => roundRanks.get(player.playerId)!)
    const worst = Math.max(...before)
    return { player, worst, when: before.indexOf(worst) + 1, climb: worst - final.get(player.playerId)! }
  })
  const back = top(climbs, (climber) => (climber.climb >= 2 ? climber.climb : undefined))
  if (!back) return undefined
  const { player, worst, when } = back.item
  return prize(
    "🚀",
    "Comeback Kid",
    player.playerId,
    `{0} was ${ordinal(worst)} after round ${when} and finished ${ordinal(final.get(player.playerId)!)}. Sickening.`
  )
}

/** The last round before the final one in which the player was alone in front. */
const lastSoleLead = (id: PlayerId, ranks: Map<PlayerId, number>[]): number | undefined => {
  const before = ranks.slice(0, -1)
  for (let round = before.length - 1; round >= 0; round--)
    if (before[round]!.get(id) === 1 && soleLeader(before[round]!)) return round
  return undefined
}

const bottledIt: Rule = ({ players, ranks, final }) => {
  if (ranks.length < 3 || players.length < 2 || !final) return undefined
  for (const player of players) {
    if (final.get(player.playerId) === 1) continue
    const led = lastSoleLead(player.playerId, ranks)
    if (led !== undefined)
      return booby("😬", "Bottled It", player.playerId, `{0} led after round ${led + 1}. Then didn't.`)
  }
  return undefined
}

const rollercoaster: Rule = ({ players }) => {
  const swings = players.flatMap((player) => {
    const scores = painted(player).map((round) => round.score)
    return scores.length >= 2 ? [{ player, high: Math.max(...scores), low: Math.min(...scores) }] : []
  })
  const wild = top(swings, (swing) => (swing.high - swing.low >= 700 ? swing.high - swing.low : undefined))
  return (
    wild &&
    booby(
      "🎢",
      "Rollercoaster",
      wild.item.player.playerId,
      `{0} scored ${Math.round(wild.item.high)} and ${Math.round(wild.item.low)} in the same game. Pick a lane.`
    )
  )
}

const beige: Rule = ({ players }) => {
  const spreads = players.flatMap((player) => {
    const scores = played(player).map((round) => round.score)
    if (scores.length < 4) return []
    const sd = Math.sqrt(mean(scores.map((score) => (score - mean(scores)) ** 2)))
    return [{ player, sd, high: Math.max(...scores), low: Math.min(...scores) }]
  })
  const steady = top(spreads, (spread) => (spread.sd < 80 ? -spread.sd : undefined))
  return (
    steady &&
    prize(
      "😐",
      "Beige",
      steady.item.player.playerId,
      `{0} never went above ${Math.round(steady.item.high)} or below ${Math.round(steady.item.low)}. Thrilling stuff.`
    )
  )
}

/** The most rounds in a row scoring 850 or more; a round sat out breaks the run. */
const longestBigRun = (player: PlayerFacts): number => {
  let run = 0
  let longest = 0
  for (const round of player.rounds) {
    run = round && round.score >= 850 ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  return longest
}

const onFire: Rule = ({ players }) => {
  const streak = top(players, (player) => {
    const longest = longestBigRun(player)
    return longest >= 3 ? longest : undefined
  })
  return (
    streak && prize("🔥", "On Fire", streak.item.playerId, `${streak.value} big rounds in a row for {0}. Unbearable.`)
  )
}

const woodenSpoon: Rule = ({ players }) => {
  const order = byTotal(players)
  return order.length >= 3
    ? booby("🥄", "Wooden Spoon", order.at(-1)!.playerId, "Someone had to come last. {0} kindly volunteered.")
    : undefined
}

const soNear: Rule = ({ players }) => {
  const [first, second] = byTotal(players)
  if (!first || !second) return undefined
  const gap = total(first) - total(second)
  return gap > 0 && gap <= 0.03 * total(first)
    ? booby("📸", "So Near", second.playerId, `{0} lost by ${Math.round(gap)} points. That'll sting for a while.`)
    : undefined
}

// Shared by two players.

/** The rounds where both put their strongest paint in the same place, and not just because both were right. */
const sharedWrongSpots = (first: PlayerFacts, second: PlayerFacts): number => {
  let count = 0
  for (let round = 0; round < Math.min(first.rounds.length, second.rounds.length); round++) {
    const firstRound = first.rounds[round]
    const secondRound = second.rounds[round]
    if (firstRound?.type !== FactsType.POINT || secondRound?.type !== FactsType.POINT) continue
    const firstPoint = firstRound.point
    const secondPoint = secondRound.point
    if (firstPoint.missCost >= 100 && greatCircleDistance(firstPoint.spot, secondPoint.spot) < firstPoint.tolerance)
      count++
  }
  return count
}

const hiveMind: Rule = ({ players }) => {
  let best: { first: PlayerFacts; second: PlayerFacts; count: number } | undefined = undefined
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const first = players[i]!
      const second = players[j]!
      const count = sharedWrongSpots(first, second)
      if (count >= 2 && (!best || count > best.count)) best = { first, second, count }
    }
  }
  if (!best) return undefined
  return {
    ...booby(
      "🧠",
      "Hive Mind",
      best.first.playerId,
      `{0} and {1} got it wrong in exactly the same place ${best.count} times. Suspicious.`
    ),
    playerIds: [best.first.playerId, best.second.playerId]
  }
}

export const GAME_RULES: Rule[] = [comebackKid, bottledIt, rollercoaster, beige, onFire, woodenSpoon, soNear, hiveMind]
