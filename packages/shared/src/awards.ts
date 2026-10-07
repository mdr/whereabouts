/**
 * Prizes and booby prizes for the results screen: a few picked at random from
 * those someone earned, spread across the players where possible.
 */
import { greatCircleDistance, type LatLon } from "./geo.ts"
import { shuffle } from "./questions.ts"

/** What one player did in one round, kept for the awards at the end. */
export interface RoundFacts {
  /** The answer's name. */
  label: string
  score: number
  passed: boolean
  /** Seconds from the round's start to locking in; null when the clock ran out. */
  lockSeconds: number | null
  roundSeconds: number
  /** Painted area, km². */
  areaKm2: number
  /** A place: where the paint was strongest, and what spreading it and missing cost (see explain.ts). */
  point?: { spot: LatLon; km: number; spread: number; distance: number; hedged: boolean; toleranceKm: number }
  /** A country: the share of the paint on it, and whether the paint was all just over the border. */
  region?: { precision: number; nextDoor: boolean }
}

export interface PlayerFacts {
  playerId: string
  /** By round; null where the player sat out. */
  rounds: (RoundFacts | null)[]
}

export interface Award {
  emoji: string
  title: string
  /** Usually one; two for an award shared by a pair. */
  playerIds: string[]
  /** The joke, with {0} and {1} where the players' names go. */
  line: string
}

interface Candidate extends Award {
  booby: boolean
}

const BOOBY = true
const PRIZE = false

export function pickAwards(players: PlayerFacts[], seed: number): Award[] {
  const all = shuffle([...soloAwards(players), ...gameAwards(players), ...pairAwards(players)], seed)
  // Two booby prizes to every real one, while both last.
  const boobies = all.filter((c) => c.booby)
  const prizes = all.filter((c) => !c.booby)
  const ordered: Candidate[] = []
  while (boobies.length + prizes.length > 0) {
    ordered.push(...boobies.splice(0, 2), ...prizes.splice(0, 1))
  }
  const max = Math.min(5, Math.max(3, players.length))
  const picked: Candidate[] = []
  const awarded = new Set<string>()
  // One each first, then seconds if there are fewer players than awards.
  for (const firstPass of [true, false]) {
    for (const c of ordered) {
      if (picked.length >= max) break
      if (picked.includes(c)) continue
      if (firstPass && c.playerIds.some((id) => awarded.has(id))) continue
      picked.push(c)
      for (const id of c.playerIds) awarded.add(id)
    }
  }
  return picked.map(({ booby: _, ...award }) => award)
}

/** The one player with the highest value, or none on a tie or when nobody qualifies. */
function top<T>(items: T[], value: (t: T) => number | null): { item: T; value: number } | null {
  let best: { item: T; value: number } | null = null
  let tied = false
  for (const item of items) {
    const v = value(item)
    if (v === null || !Number.isFinite(v)) continue
    if (!best || v > best.value) {
      best = { item, value: v }
      tied = false
    } else if (v === best.value) tied = true
  }
  return tied ? null : best
}

const played = (p: PlayerFacts) => p.rounds.filter((r): r is RoundFacts => r !== null)
const painted = (p: PlayerFacts) => played(p).filter((r) => !r.passed)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const total = (p: PlayerFacts) => played(p).reduce((s, r) => s + r.score, 0)

/** Awards for a single round or a habit across rounds. */
function soloAwards(players: PlayerFacts[]): Candidate[] {
  const out: Candidate[] = []
  const add = (booby: boolean, emoji: string, title: string, playerId: string, line: string) =>
    out.push({ booby, emoji, title, playerIds: [playerId], line })

  // The best and worst single rounds.
  const rounds = players.flatMap((p) => painted(p).map((r) => ({ p, r })))
  const bull = top(rounds, ({ r }) => (r.score >= 950 ? r.score : null))
  if (bull)
    add(
      PRIZE,
      "🎯",
      "Bullseye",
      bull.item.p.playerId,
      `{0} put ${bull.item.r.label} dead centre. Nobody likes a show-off.`
    )

  const mile = top(rounds, ({ r }) => (r.point && r.point.km >= 1500 && r.point.distance >= 400 ? r.point.km : null))
  if (mile) {
    add(
      BOOBY,
      "🛰️",
      "Off by a Mile",
      mile.item.p.playerId,
      `{0} put ${mile.item.r.label} ${roughKm(mile.value)} away. Visible from space, to be fair.`
    )
  }

  const sure = top(rounds, ({ r }) =>
    r.point && r.point.spread < 100 && r.point.distance >= 600 ? r.point.distance : null
  )
  if (sure)
    add(
      BOOBY,
      "🫡",
      "Confidently Wrong",
      sure.item.p.playerId,
      `{0} was absolutely certain about ${sure.item.r.label}. Absolutely.`
    )

  const door = rounds.find(({ r }) => r.region?.nextDoor)
  if (door)
    add(
      BOOBY,
      "🏡",
      "Wrong House",
      door.p.playerId,
      `{0} painted next door to ${door.r.label}. The neighbours have been informed.`
    )

  const spill = top(rounds, ({ r }) =>
    r.region && r.region.precision >= 0.1 && r.region.precision <= 0.5 ? 1 - r.region.precision : null
  )
  if (spill) add(BOOBY, "🚧", "Border Control", spill.item.p.playerId, `{0} treats borders as more of a suggestion.`)

  // Habits.
  const fence = top(players, (p) => {
    const spreads = painted(p).flatMap((r) => (r.point ? [r.point.spread] : []))
    return spreads.length >= 2 && mean(spreads) >= 300 ? mean(spreads) : null
  })
  if (fence)
    add(
      BOOBY,
      "🤷",
      "Fence Sitter",
      fence.item.playerId,
      "{0} painted half the planet every round and called it a guess."
    )

  const hedge = top(players, (p) => {
    const n = painted(p).filter((r) => r.point?.hedged).length
    return n >= 2 ? n : null
  })
  if (hedge)
    add(
      BOOBY,
      "📈",
      "Hedge Fund Manager",
      hedge.item.playerId,
      `{0} spread their bets ${hedge.value} times. The returns were poor.`
    )

  const chicken = top(players, (p) => {
    const n = played(p).filter((r) => r.passed).length
    return n >= 2 ? n : null
  })
  if (chicken) add(BOOBY, "🐔", "Chicken", chicken.item.playerId, `{0} passed ${chicken.value} times. Brave.`)

  const fast = top(players, (p) => {
    const rs = painted(p)
    const times = rs.flatMap((r) => (r.lockSeconds === null ? [] : [r.lockSeconds / r.roundSeconds]))
    return rs.length >= 3 && times.length === rs.length && mean(times) < 0.4 ? -mean(times) : null
  })
  if (fast) {
    const secs = Math.round(mean(painted(fast.item).map((r) => r.lockSeconds!)))
    add(
      PRIZE,
      "⚡",
      "Fastest Finger",
      fast.item.playerId,
      `{0} locked in after ${secs} seconds on average. Thinking is overrated.`
    )
  }

  const slow = top(players, (p) => {
    const n = painted(p).filter((r) => r.lockSeconds === null || r.roundSeconds - r.lockSeconds < 5).length
    return n >= 2 ? n : null
  })
  if (slow) add(BOOBY, "⏰", "Last-Second Merchant", slow.item.playerId, `{0} made everyone wait. ${slow.value} times.`)

  const areas = players.map((p) => painted(p).reduce((s, r) => s + r.areaKm2, 0))
  const picasso = top(players, (p) => {
    const a = painted(p).reduce((s, r) => s + r.areaKm2, 0)
    return a > 0 && a >= 2 * median(areas) ? a : null
  })
  if (picasso) add(BOOBY, "🎨", "Picasso", picasso.item.playerId, "{0} used twice the paint of anyone sensible.")

  const dab = top(players, (p) => {
    const rs = painted(p)
    return rs.length >= 3 ? -mean(rs.map((r) => r.areaKm2)) : null
  })
  if (dab && players.length >= 2) {
    add(PRIZE, "🤏", "One Careful Dab", dab.item.playerId, "{0} painted like the paint was coming out of their wages.")
  }
  return out
}

/** Awards for the shape of a whole game: standings, streaks and swings. */
function gameAwards(players: PlayerFacts[]): Candidate[] {
  const out: Candidate[] = []
  const add = (booby: boolean, emoji: string, title: string, playerId: string, line: string) =>
    out.push({ booby, emoji, title, playerIds: [playerId], line })
  const n = Math.max(0, ...players.map((p) => p.rounds.length))
  const ranks = rankHistory(players, n)
  const final = ranks.at(-1)

  if (n >= 3 && players.length >= 3 && final) {
    const back = top(players, (p) => {
      const worst = Math.max(...ranks.slice(0, -1).map((r) => r.get(p.playerId)!))
      const climb = worst - final.get(p.playerId)!
      return climb >= 2 ? climb : null
    })
    if (back) {
      const id = back.item.playerId
      const worst = Math.max(...ranks.slice(0, -1).map((r) => r.get(id)!))
      const when = ranks.findIndex((r) => r.get(id) === worst) + 1
      add(
        PRIZE,
        "🚀",
        "Comeback Kid",
        id,
        `{0} was ${ordinal(worst)} after round ${when} and finished ${ordinal(final.get(id)!)}. Sickening.`
      )
    }
  }

  if (n >= 3 && players.length >= 2 && final) {
    for (const p of players) {
      if (final.get(p.playerId) === 1) continue
      let led = -1
      for (let r = 0; r < ranks.length - 1; r++) if (ranks[r]!.get(p.playerId) === 1 && soleLeader(ranks[r]!)) led = r
      if (led >= 0) {
        add(BOOBY, "😬", "Bottled It", p.playerId, `{0} led after round ${led + 1}. Then didn't.`)
        break
      }
    }
  }

  const coaster = top(players, (p) => {
    const s = painted(p).map((r) => r.score)
    return s.length >= 2 && Math.max(...s) - Math.min(...s) >= 700 ? Math.max(...s) - Math.min(...s) : null
  })
  if (coaster) {
    const s = painted(coaster.item).map((r) => Math.round(r.score))
    add(
      BOOBY,
      "🎢",
      "Rollercoaster",
      coaster.item.playerId,
      `{0} scored ${Math.max(...s)} and ${Math.min(...s)} in the same game. Pick a lane.`
    )
  }

  const steady = top(players, (p) => {
    const s = played(p).map((r) => r.score)
    if (s.length < 4) return null
    const sd = Math.sqrt(mean(s.map((x) => (x - mean(s)) ** 2)))
    return sd < 80 ? -sd : null
  })
  if (steady) {
    const s = played(steady.item).map((r) => Math.round(r.score))
    add(
      PRIZE,
      "😐",
      "Beige",
      steady.item.playerId,
      `{0} never went above ${Math.max(...s)} or below ${Math.min(...s)}. Thrilling stuff.`
    )
  }

  const streak = top(players, (p) => {
    let run = 0
    let longest = 0
    for (const r of p.rounds) {
      run = r && r.score >= 850 ? run + 1 : 0
      longest = Math.max(longest, run)
    }
    return longest >= 3 ? longest : null
  })
  if (streak)
    add(PRIZE, "🔥", "On Fire", streak.item.playerId, `${streak.value} big rounds in a row for {0}. Unbearable.`)

  const order = [...players].sort((a, b) => total(b) - total(a))
  if (order.length >= 3) {
    add(BOOBY, "🥄", "Wooden Spoon", order.at(-1)!.playerId, "Someone had to come last. {0} kindly volunteered.")
  }
  if (order.length >= 2) {
    const gap = total(order[0]!) - total(order[1]!)
    if (gap > 0 && gap <= 0.03 * total(order[0]!)) {
      add(
        BOOBY,
        "📸",
        "So Near",
        order[1]!.playerId,
        `{0} lost by ${Math.round(gap)} points. That'll sting for a while.`
      )
    }
  }
  return out
}

/** Awards shared by two players. */
function pairAwards(players: PlayerFacts[]): Candidate[] {
  let best: { a: PlayerFacts; b: PlayerFacts; n: number } | null = null
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!
      const b = players[j]!
      let n = 0
      for (let r = 0; r < Math.min(a.rounds.length, b.rounds.length); r++) {
        const pa = a.rounds[r]?.point
        const pb = b.rounds[r]?.point
        // The same spot, and not just because both were right.
        if (pa && pb && pa.distance >= 100 && greatCircleDistance(pa.spot, pb.spot) < pa.toleranceKm) n++
      }
      if (n >= 2 && (!best || n > best.n)) best = { a, b, n }
    }
  }
  if (!best) return []
  return [
    {
      booby: BOOBY,
      emoji: "🧠",
      title: "Hive Mind",
      playerIds: [best.a.playerId, best.b.playerId],
      line: `{0} and {1} got it wrong in exactly the same place ${best.n} times. Suspicious.`
    }
  ]
}

/** Each player's rank after each round. */
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

function roughKm(km: number): string {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(km)) - 1)
  return `${(Math.round(km / step) * step).toLocaleString("en")} km`
}
