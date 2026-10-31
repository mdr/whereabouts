import { describe, expect, it } from "vite-plus/test"
import { playerId, playerToken, type PlayerName } from "./ids.ts"
import type { Player } from "./seats.ts"
import { finalStandings, playerViews, rankAmong } from "./standings.ts"

let made = 0
const makePlayer = (overrides: Partial<Player> = {}): Player => {
  made++
  return {
    id: playerId(`p${made}`),
    token: playerToken(`token-${made}`.padEnd(16, "0")),
    name: `Player ${made}` as PlayerName,
    colour: undefined,
    watching: false,
    connected: true,
    leftAt: undefined,
    joinedAt: 0,
    joinedRound: 0,
    scores: [],
    facts: [],
    previousRank: undefined,
    hintsUsed: 0,
    ...overrides
  }
}

describe("finalStandings", () => {
  it("leaves the rounds a late joiner missed empty, and totals only what they played", () => {
    const early = makePlayer({ scores: [100, 200, 300] })
    const late = makePlayer({ scores: [undefined, undefined, 700], joinedRound: 2 })
    const [first, second] = finalStandings([early, late], 3)
    expect(first).toEqual({ playerId: late.id, total: 700, rounds: [{}, {}, { score: 700 }] })
    expect(second).toEqual({
      playerId: early.id,
      total: 600,
      rounds: [{ score: 100 }, { score: 200 }, { score: 300 }]
    })
  })
})

describe("rankAmong", () => {
  it("gives tied totals one rank and skips the next", () => {
    const a = makePlayer({ scores: [50] })
    const b = makePlayer({ scores: [50] })
    const c = makePlayer({ scores: [10] })
    const all = [a, b, c]
    expect(all.map((p) => rankAmong(p, all))).toEqual([1, 1, 3])
  })
})

describe("playerViews", () => {
  it("lists players by rank then name, spectators last and unranked", () => {
    const zed = makePlayer({ name: "Zed" as PlayerName, scores: [10] })
    const amy = makePlayer({ name: "Amy" as PlayerName, scores: [10] })
    const top = makePlayer({ name: "Top" as PlayerName, scores: [90] })
    const watcher = makePlayer({ name: "Aaa" as PlayerName, watching: true })
    const views = playerViews([zed, watcher, amy, top], undefined, () => false)
    expect(views.map((v) => [v.name, v.rank])).toEqual([
      ["Top", 1],
      ["Amy", 2],
      ["Zed", 2],
      ["Aaa", 0]
    ])
  })

  it("marks the host and who has locked in", () => {
    const host = makePlayer()
    const other = makePlayer()
    const views = playerViews([host, other], host.token, (t) => t === other.token)
    expect(views.find((v) => v.id === host.id)).toMatchObject({ isHost: true, locked: false })
    expect(views.find((v) => v.id === other.id)).toMatchObject({ isHost: false, locked: true })
  })
})
