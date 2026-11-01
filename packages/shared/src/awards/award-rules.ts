import type { PlayerId } from "../ids.ts"
import { greatCircleDistance } from "../geo.ts"
import type { Km, Ms, Points } from "../units.ts"
import { FactsType, type Award, type AreaFacts, type PlayerFacts, type PointFacts, type RoundFacts } from "./awards.ts"

export interface Candidate extends Award {
  booby: boolean
}

type PaintedFacts = PointFacts | AreaFacts

interface PaintedRound {
  player: PlayerFacts
  round: PaintedFacts
}

/** What the rules share, worked out once. */
interface Context {
  players: PlayerFacts[]
  rounds: PaintedRound[]
  /** Each player's rank after each round. */
  ranks: Map<PlayerId, number>[]
  /** The ranks after the last round. */
  final: Map<PlayerId, number> | undefined
}

type Rule = (ctx: Context) => Candidate | undefined

const prize = (emoji: string, title: string, playerId: PlayerId, line: string): Candidate => ({
  booby: false,
  emoji,
  title,
  playerIds: [playerId],
  line
})

const booby = (emoji: string, title: string, playerId: PlayerId, line: string): Candidate => ({
  ...prize(emoji, title, playerId, line),
  booby: true
})

/** The end of a round that counts as the last second: 5 s, less in short rounds. */
const lastSecond = (roundLength: Ms): Ms => Math.min(5000, roundLength / 6)

/** The one player with the highest value, or none on a tie or when nobody qualifies. */
function top<T>(items: T[], value: (item: T) => number | undefined): { item: T; value: number } | undefined {
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

const played = (player: PlayerFacts) => player.rounds.filter((round): round is RoundFacts => round !== undefined)
const painted = (player: PlayerFacts) =>
  played(player).filter((round): round is PaintedFacts => round.type !== FactsType.PASSED)
const pointRounds = (player: PlayerFacts) =>
  played(player).filter((round): round is PointFacts => round.type === FactsType.POINT)
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
const total = (player: PlayerFacts): Points => played(player).reduce((sum, round) => sum + round.score, 0)
const paintedArea = (player: PlayerFacts) => painted(player).reduce((sum, round) => sum + round.area, 0)
const byTotal = (players: PlayerFacts[]) => [...players].sort((a, b) => total(b) - total(a))

// Single rounds.

const bullseye: Rule = ({ rounds }) => {
  const best = top(rounds, ({ round }) => (round.score >= 950 ? round.score : undefined))
  return (
    best &&
    prize(
      "🎯",
      "Bullseye",
      best.item.player.playerId,
      `{0} put ${best.item.round.label} dead centre. Nobody likes a show-off.`
    )
  )
}

const offByAMile: Rule = ({ rounds }) => {
  const far = top(rounds, ({ round }) =>
    round.type === FactsType.POINT && round.point.miss >= 1500 && round.point.missCost >= 400
      ? round.point.miss
      : undefined
  )
  return (
    far &&
    booby(
      "🛰️",
      "Off by a Mile",
      far.item.player.playerId,
      `{0} put ${far.item.round.label} ${roughDistance(far.value)} away. Visible from space, to be fair.`
    )
  )
}

const confidentlyWrong: Rule = ({ rounds }) => {
  const sure = top(rounds, ({ round }) =>
    round.type === FactsType.POINT && round.point.spread < 100 && round.point.missCost >= 600
      ? round.point.missCost
      : undefined
  )
  return (
    sure &&
    booby(
      "🫡",
      "Confidently Wrong",
      sure.item.player.playerId,
      `{0} was absolutely certain about ${sure.item.round.label}. Absolutely.`
    )
  )
}

const wrongHouse: Rule = ({ rounds }) => {
  const door = rounds.find(({ round }) => round.type === FactsType.AREA && round.region.nextDoor)
  return (
    door &&
    booby(
      "🏡",
      "Wrong House",
      door.player.playerId,
      `{0} painted next door to ${door.round.label}. The neighbours have been informed.`
    )
  )
}

const borderControl: Rule = ({ rounds }) => {
  const spill = top(rounds, ({ round }) =>
    round.type === FactsType.AREA && round.region.precision >= 0.1 && round.region.precision <= 0.5
      ? 1 - round.region.precision
      : undefined
  )
  return (
    spill && booby("🚧", "Border Control", spill.item.player.playerId, `{0} treats borders as more of a suggestion.`)
  )
}

// Habits.

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
function lockStats(player: PlayerFacts) {
  const rounds = painted(player)
  if (rounds.length < 3) return undefined
  const locks = rounds.flatMap((round) =>
    round.lockedAfter === undefined ? [] : [{ after: round.lockedAfter, of: round.roundLength }]
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
        round.lockedAfter === undefined || round.roundLength - round.lockedAfter < lastSecond(round.roundLength)
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

// The shape of a whole game: standings, streaks and swings.

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
function lastSoleLead(id: PlayerId, ranks: Map<PlayerId, number>[]): number | undefined {
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
function longestBigRun(player: PlayerFacts): number {
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
function sharedWrongSpots(first: PlayerFacts, second: PlayerFacts): number {
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

// The order here is the order of the candidates before they are shuffled.
const RULES: Rule[] = [
  bullseye,
  offByAMile,
  confidentlyWrong,
  wrongHouse,
  borderControl,
  fenceSitter,
  hedgeFundManager,
  chicken,
  fastestFinger,
  lastSecondMerchant,
  picasso,
  oneCarefulDab,
  comebackKid,
  bottledIt,
  rollercoaster,
  beige,
  onFire,
  woodenSpoon,
  soNear,
  hiveMind
]

/** Every award someone earned, prizes and booby prizes alike. */
export function candidateAwards(players: PlayerFacts[]): Candidate[] {
  const rounds = players.flatMap((player) => painted(player).map((round) => ({ player, round })))
  const ranks = rankHistory(players, Math.max(0, ...players.map((player) => player.rounds.length)))
  const ctx: Context = { players, rounds, ranks, final: ranks.at(-1) }
  return RULES.flatMap((rule) => rule(ctx) ?? [])
}

function rankHistory(players: PlayerFacts[], rounds: number): Map<PlayerId, number>[] {
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

const soleLeader = (ranks: Map<PlayerId, number>) => [...ranks.values()].filter((rank) => rank === 1).length === 1

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!
}

function ordinal(position: number): string {
  const suffix = position % 100 >= 11 && position % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][position % 10] ?? "th")
  return `${position}${suffix}`
}

function roughDistance(km: Km): string {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(km)) - 1)
  return `${(Math.round(km / step) * step).toLocaleString("en")} km`
}
