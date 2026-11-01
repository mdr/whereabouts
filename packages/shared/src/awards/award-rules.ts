import type { PlayerId } from "../ids.ts"
import { greatCircleDistance } from "../geo.ts"
import type { Km, Ms, Points } from "../units.ts"
import { FactsType, type Award, type AreaFacts, type PlayerFacts, type PointFacts, type RoundFacts } from "./awards.ts"

export interface Candidate extends Award {
  booby: boolean
}

type PaintedFacts = PointFacts | AreaFacts

interface PaintedRound {
  p: PlayerFacts
  r: PaintedFacts
}

/** What the rules share, worked out once. */
interface Context {
  players: PlayerFacts[]
  rounds: PaintedRound[]
  /** Each player's rank after each round. */
  ranks: Map<string, number>[]
  /** The ranks after the last round. */
  final: Map<string, number> | undefined
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
function top<T>(items: T[], value: (t: T) => number | undefined): { item: T; value: number } | undefined {
  let best: { item: T; value: number } | undefined = undefined
  let tied = false
  for (const item of items) {
    const v = value(item)
    if (v === undefined || !Number.isFinite(v)) continue
    if (!best || v > best.value) {
      best = { item, value: v }
      tied = false
    } else if (v === best.value) tied = true
  }
  return tied ? undefined : best
}

const played = (p: PlayerFacts) => p.rounds.filter((r): r is RoundFacts => r !== undefined)
const painted = (p: PlayerFacts) => played(p).filter((r): r is PaintedFacts => r.type !== FactsType.PASSED)
const pointRounds = (p: PlayerFacts) => played(p).filter((r): r is PointFacts => r.type === FactsType.POINT)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const total = (p: PlayerFacts): Points => played(p).reduce((s, r) => s + r.score, 0)
const paintedArea = (p: PlayerFacts) => painted(p).reduce((s, r) => s + r.area, 0)
const byTotal = (players: PlayerFacts[]) => [...players].sort((a, b) => total(b) - total(a))

// Single rounds.

const bullseye: Rule = ({ rounds }) => {
  const best = top(rounds, ({ r }) => (r.score >= 950 ? r.score : undefined))
  return (
    best &&
    prize("🎯", "Bullseye", best.item.p.playerId, `{0} put ${best.item.r.label} dead centre. Nobody likes a show-off.`)
  )
}

const offByAMile: Rule = ({ rounds }) => {
  const far = top(rounds, ({ r }) =>
    r.type === FactsType.POINT && r.point.miss >= 1500 && r.point.missCost >= 400 ? r.point.miss : undefined
  )
  return (
    far &&
    booby(
      "🛰️",
      "Off by a Mile",
      far.item.p.playerId,
      `{0} put ${far.item.r.label} ${roughDistance(far.value)} away. Visible from space, to be fair.`
    )
  )
}

const confidentlyWrong: Rule = ({ rounds }) => {
  const sure = top(rounds, ({ r }) =>
    r.type === FactsType.POINT && r.point.spread < 100 && r.point.missCost >= 600 ? r.point.missCost : undefined
  )
  return (
    sure &&
    booby(
      "🫡",
      "Confidently Wrong",
      sure.item.p.playerId,
      `{0} was absolutely certain about ${sure.item.r.label}. Absolutely.`
    )
  )
}

const wrongHouse: Rule = ({ rounds }) => {
  const door = rounds.find(({ r }) => r.type === FactsType.AREA && r.region.nextDoor)
  return (
    door &&
    booby(
      "🏡",
      "Wrong House",
      door.p.playerId,
      `{0} painted next door to ${door.r.label}. The neighbours have been informed.`
    )
  )
}

const borderControl: Rule = ({ rounds }) => {
  const spill = top(rounds, ({ r }) =>
    r.type === FactsType.AREA && r.region.precision >= 0.1 && r.region.precision <= 0.5
      ? 1 - r.region.precision
      : undefined
  )
  return spill && booby("🚧", "Border Control", spill.item.p.playerId, `{0} treats borders as more of a suggestion.`)
}

// Habits.

const fenceSitter: Rule = ({ players }) => {
  const sitter = top(players, (p) => {
    const spreads = pointRounds(p).map((r) => r.point.spread)
    return spreads.length >= 2 && mean(spreads) >= 300 ? mean(spreads) : undefined
  })
  return (
    sitter &&
    booby("🤷", "Fence Sitter", sitter.item.playerId, "{0} painted half the planet every round and called it a guess.")
  )
}

const hedgeFundManager: Rule = ({ players }) => {
  const hedger = top(players, (p) => {
    const n = pointRounds(p).filter((r) => r.point.hedged).length
    return n >= 2 ? n : undefined
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
  const passer = top(players, (p) => {
    const n = played(p).filter((r) => r.type === FactsType.PASSED).length
    return n >= 2 ? n : undefined
  })
  return passer && booby("🐔", "Chicken", passer.item.playerId, `{0} passed ${passer.value} times. Brave.`)
}

/** How early in the round a player locked in, if they did every time. */
function lockStats(p: PlayerFacts) {
  const rs = painted(p)
  if (rs.length < 3) return undefined
  const locks = rs.flatMap((r) => (r.lockedAfter === undefined ? [] : [{ after: r.lockedAfter, of: r.roundLength }]))
  if (locks.length < rs.length) return undefined
  return { p, share: mean(locks.map((l) => l.after / l.of)), meanLock: mean(locks.map((l) => l.after)) }
}

const fastestFinger: Rule = ({ players }) => {
  const fast = top(
    players.flatMap((p) => lockStats(p) ?? []),
    (s) => (s.share < 0.4 ? -s.share : undefined)
  )
  return (
    fast &&
    prize(
      "⚡",
      "Fastest Finger",
      fast.item.p.playerId,
      `{0} locked in after ${Math.round(fast.item.meanLock / 1000)} seconds on average. Thinking is overrated.`
    )
  )
}

const lastSecondMerchant: Rule = ({ players }) => {
  const slow = top(players, (p) => {
    const n = painted(p).filter(
      (r) => r.lockedAfter === undefined || r.roundLength - r.lockedAfter < lastSecond(r.roundLength)
    ).length
    return n >= 2 ? n : undefined
  })
  return slow && booby("⏰", "Last-Second Merchant", slow.item.playerId, `{0} made everyone wait. ${slow.value} times.`)
}

const picasso: Rule = ({ players }) => {
  const messy = top(players, (p) => {
    const area = paintedArea(p)
    // Against the others alone: counting your own paint, two players could never earn it.
    const sensible = median(players.filter((o) => o !== p).map(paintedArea))
    return sensible > 0 && area >= 2 * sensible ? area : undefined
  })
  return messy && booby("🎨", "Picasso", messy.item.playerId, "{0} used twice the paint of anyone sensible.")
}

const oneCarefulDab: Rule = ({ players }) => {
  if (players.length < 2) return undefined
  const careful = top(players, (p) => {
    const rs = painted(p)
    return rs.length >= 3 ? -mean(rs.map((r) => r.area)) : undefined
  })
  return (
    careful &&
    prize("🤏", "One Careful Dab", careful.item.playerId, "{0} painted like the paint was coming out of their wages.")
  )
}

// The shape of a whole game: standings, streaks and swings.

const comebackKid: Rule = ({ players, ranks, final }) => {
  if (ranks.length < 3 || players.length < 3 || !final) return undefined
  const climbs = players.map((p) => {
    const before = ranks.slice(0, -1).map((r) => r.get(p.playerId)!)
    const worst = Math.max(...before)
    return { p, worst, when: before.indexOf(worst) + 1, climb: worst - final.get(p.playerId)! }
  })
  const back = top(climbs, (c) => (c.climb >= 2 ? c.climb : undefined))
  if (!back) return undefined
  const { p, worst, when } = back.item
  return prize(
    "🚀",
    "Comeback Kid",
    p.playerId,
    `{0} was ${ordinal(worst)} after round ${when} and finished ${ordinal(final.get(p.playerId)!)}. Sickening.`
  )
}

/** The last round before the final one in which the player was alone in front. */
function lastSoleLead(id: PlayerId, ranks: Map<string, number>[]): number | undefined {
  const before = ranks.slice(0, -1)
  for (let r = before.length - 1; r >= 0; r--) if (before[r]!.get(id) === 1 && soleLeader(before[r]!)) return r
  return undefined
}

const bottledIt: Rule = ({ players, ranks, final }) => {
  if (ranks.length < 3 || players.length < 2 || !final) return undefined
  for (const p of players) {
    if (final.get(p.playerId) === 1) continue
    const led = lastSoleLead(p.playerId, ranks)
    if (led !== undefined) return booby("😬", "Bottled It", p.playerId, `{0} led after round ${led + 1}. Then didn't.`)
  }
  return undefined
}

const rollercoaster: Rule = ({ players }) => {
  const swings = players.flatMap((p) => {
    const scores = painted(p).map((r) => r.score)
    return scores.length >= 2 ? [{ p, high: Math.max(...scores), low: Math.min(...scores) }] : []
  })
  const wild = top(swings, (s) => (s.high - s.low >= 700 ? s.high - s.low : undefined))
  return (
    wild &&
    booby(
      "🎢",
      "Rollercoaster",
      wild.item.p.playerId,
      `{0} scored ${Math.round(wild.item.high)} and ${Math.round(wild.item.low)} in the same game. Pick a lane.`
    )
  )
}

const beige: Rule = ({ players }) => {
  const spreads = players.flatMap((p) => {
    const scores = played(p).map((r) => r.score)
    if (scores.length < 4) return []
    const sd = Math.sqrt(mean(scores.map((x) => (x - mean(scores)) ** 2)))
    return [{ p, sd, high: Math.max(...scores), low: Math.min(...scores) }]
  })
  const steady = top(spreads, (s) => (s.sd < 80 ? -s.sd : undefined))
  return (
    steady &&
    prize(
      "😐",
      "Beige",
      steady.item.p.playerId,
      `{0} never went above ${Math.round(steady.item.high)} or below ${Math.round(steady.item.low)}. Thrilling stuff.`
    )
  )
}

/** The most rounds in a row scoring 850 or more; a round sat out breaks the run. */
function longestBigRun(p: PlayerFacts): number {
  let run = 0
  let longest = 0
  for (const r of p.rounds) {
    run = r && r.score >= 850 ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  return longest
}

const onFire: Rule = ({ players }) => {
  const streak = top(players, (p) => {
    const longest = longestBigRun(p)
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
function sharedWrongSpots(a: PlayerFacts, b: PlayerFacts): number {
  let n = 0
  for (let r = 0; r < Math.min(a.rounds.length, b.rounds.length); r++) {
    const ra = a.rounds[r]
    const rb = b.rounds[r]
    if (ra?.type !== FactsType.POINT || rb?.type !== FactsType.POINT) continue
    const pa = ra.point
    const pb = rb.point
    if (pa.missCost >= 100 && greatCircleDistance(pa.spot, pb.spot) < pa.tolerance) n++
  }
  return n
}

const hiveMind: Rule = ({ players }) => {
  let best: { a: PlayerFacts; b: PlayerFacts; n: number } | undefined = undefined
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!
      const b = players[j]!
      const n = sharedWrongSpots(a, b)
      if (n >= 2 && (!best || n > best.n)) best = { a, b, n }
    }
  }
  if (!best) return undefined
  return {
    ...booby(
      "🧠",
      "Hive Mind",
      best.a.playerId,
      `{0} and {1} got it wrong in exactly the same place ${best.n} times. Suspicious.`
    ),
    playerIds: [best.a.playerId, best.b.playerId]
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
  const rounds = players.flatMap((p) => painted(p).map((r) => ({ p, r })))
  const ranks = rankHistory(players, Math.max(0, ...players.map((p) => p.rounds.length)))
  const ctx: Context = { players, rounds, ranks, final: ranks.at(-1) }
  return RULES.flatMap((rule) => rule(ctx) ?? [])
}

function rankHistory(players: PlayerFacts[], rounds: number): Map<string, number>[] {
  const running = new Map(players.map((p) => [p.playerId, 0]))
  const out: Map<string, number>[] = []
  for (let r = 0; r < rounds; r++) {
    for (const p of players) running.set(p.playerId, running.get(p.playerId)! + (p.rounds[r]?.score ?? 0))
    const ranks = new Map<string, number>()
    for (const [id, s] of running) ranks.set(id, 1 + [...running.values()].filter((x) => x > s).length)
    out.push(ranks)
  }
  return out
}

const soleLeader = (ranks: Map<string, number>) => [...ranks.values()].filter((r) => r === 1).length === 1

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)]!
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")
  return `${n}${suffix}`
}

function roughDistance(km: Km): string {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(km)) - 1)
  return `${(Math.round(km / step) * step).toLocaleString("en")} km`
}
