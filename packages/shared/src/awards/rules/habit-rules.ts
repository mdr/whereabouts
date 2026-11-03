import { FactsType, type PlayerFacts } from "../player-facts.ts"
import {
  booby,
  lastSecond,
  mean,
  median,
  painted,
  paintedArea,
  played,
  pointRounds,
  prize,
  top,
  type Rule
} from "./rule-kit.ts"

const fenceSitter: Rule = ({ players }) => {
  const sitter = top(players, (player) => {
    const spreads = pointRounds(player).map((round) => round.point.spread)
    return spreads.length >= 2 && mean(spreads) >= 300 ? mean(spreads) : undefined
  })
  return (
    sitter &&
    booby("🤷", "Fence Sitter", sitter.item.playerId, "{0} painted half the planet every round and called it a guess.")
  )
}

const hedgeFundManager: Rule = ({ players }) => {
  const hedger = top(players, (player) => {
    const count = pointRounds(player).filter((round) => round.point.hedged).length
    return count >= 2 ? count : undefined
  })
  return (
    hedger &&
    booby(
      "📈",
      "Hedge Fund Manager",
      hedger.item.playerId,
      `{0} spread their bets ${hedger.value} times. The returns were poor.`
    )
  )
}

const chicken: Rule = ({ players }) => {
  const passer = top(players, (player) => {
    const count = played(player).filter((round) => round.type === FactsType.PASSED).length
    return count >= 2 ? count : undefined
  })
  return passer && booby("🐔", "Chicken", passer.item.playerId, `{0} passed ${passer.value} times. Brave.`)
}

/** How early in the round a player locked in, if they did every time. */
const lockStats = (player: PlayerFacts): { player: PlayerFacts; share: number; meanLock: number } | undefined => {
  const rounds = painted(player)
  if (rounds.length < 3) return undefined
  const locks = rounds.flatMap((round) =>
    round.lockedAfter === undefined || round.roundLength === undefined
      ? []
      : [{ after: round.lockedAfter, of: round.roundLength }]
  )
  if (locks.length < rounds.length) return undefined
  return {
    player,
    share: mean(locks.map((lock) => lock.after / lock.of)),
    meanLock: mean(locks.map((lock) => lock.after))
  }
}

const fastestFinger: Rule = ({ players }) => {
  const fast = top(
    players.flatMap((player) => lockStats(player) ?? []),
    (stats) => (stats.share < 0.4 ? -stats.share : undefined)
  )
  return (
    fast &&
    prize(
      "⚡",
      "Fastest Finger",
      fast.item.player.playerId,
      `{0} locked in after ${Math.round(fast.item.meanLock / 1000)} seconds on average. Thinking is overrated.`
    )
  )
}

const lastSecondMerchant: Rule = ({ players }) => {
  const slow = top(players, (player) => {
    const count = painted(player).filter(
      (round) =>
        round.roundLength !== undefined &&
        (round.lockedAfter === undefined || round.roundLength - round.lockedAfter < lastSecond(round.roundLength))
    ).length
    return count >= 2 ? count : undefined
  })
  return slow && booby("⏰", "Last-Second Merchant", slow.item.playerId, `{0} made everyone wait. ${slow.value} times.`)
}

const picasso: Rule = ({ players }) => {
  const messy = top(players, (player) => {
    const area = paintedArea(player)
    // Against the others alone: counting your own paint, two players could never earn it.
    const sensible = median(players.filter((other) => other !== player).map(paintedArea))
    return sensible > 0 && area >= 2 * sensible ? area : undefined
  })
  return messy && booby("🎨", "Picasso", messy.item.playerId, "{0} used twice the paint of anyone sensible.")
}

const oneCarefulDab: Rule = ({ players }) => {
  if (players.length < 2) return undefined
  const careful = top(players, (player) => {
    const rounds = painted(player)
    return rounds.length >= 3 ? -mean(rounds.map((round) => round.area)) : undefined
  })
  return (
    careful &&
    prize("🤏", "One Careful Dab", careful.item.playerId, "{0} painted like the paint was coming out of their wages.")
  )
}

export const HABIT_RULES: Rule[] = [
  fenceSitter,
  hedgeFundManager,
  chicken,
  fastestFinger,
  lastSecondMerchant,
  picasso,
  oneCarefulDab
]
