import { describe, expect, it } from "vite-plus/test"
import { playerColour } from "../colours.ts"
import { playerId, playerToken, type PlayerName } from "../ids.ts"
import { Role } from "../roles.ts"
import { freshRecord, type PlayerRecord, type PlayerSeat, type Seat } from "./seats.ts"
import { finalStandings, playerViews, rankAmong } from "./standings.ts"

let made = 0
const makeSeat = (): Omit<Seat, "role"> => {
  made++
  return {
    id: playerId(`p${made}`),
    token: playerToken(`token-${made}`.padEnd(16, "0")),
    name: `Player ${made}` as PlayerName,
    connected: true,
    leftAt: undefined,
    joinedAt: 0
  }
}

const makePlayerSeat = (record: Partial<PlayerRecord> = {}, over: Partial<Seat> = {}): PlayerSeat => ({
  ...makeSeat(),
  ...over,
  role: { type: Role.PLAYER, colour: playerColour(0), record: { ...freshRecord(0), ...record } }
})

const makeSpectatorSeat = (over: Partial<Seat> = {}): Seat => ({
  ...makeSeat(),
  ...over,
  role: { type: Role.SPECTATOR }
})

describe("finalStandings", () => {
  it("leaves the rounds a late joiner missed empty, and totals only what they played", () => {
    const early = makePlayerSeat({ scores: [100, 200, 300] })
    const late = makePlayerSeat({ scores: [undefined, undefined, 700], joinedRound: 2 })
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
    const a = makePlayerSeat({ scores: [50] })
    const b = makePlayerSeat({ scores: [50] })
    const c = makePlayerSeat({ scores: [10] })
    const all = [a, b, c]
    expect(all.map((p) => rankAmong(p, all))).toEqual([1, 1, 3])
  })
})

describe("playerViews", () => {
  it("lists players by rank then name, spectators last and unranked", () => {
    const zed = makePlayerSeat({ scores: [10] }, { name: "Zed" as PlayerName })
    const amy = makePlayerSeat({ scores: [10] }, { name: "Amy" as PlayerName })
    const top = makePlayerSeat({ scores: [90] }, { name: "Top" as PlayerName })
    const watcher = makeSpectatorSeat({ name: "Aaa" as PlayerName })
    const views = playerViews([zed, watcher, amy, top], undefined, () => false)
    expect(views.map((v) => [v.name, v.rank])).toEqual([
      ["Top", 1],
      ["Amy", 2],
      ["Zed", 2],
      ["Aaa", 0]
    ])
  })

  it("marks the host and who has locked in", () => {
    const host = makePlayerSeat()
    const other = makePlayerSeat()
    const views = playerViews([host, other], host.token, (t) => t === other.token)
    expect(views.find((v) => v.id === host.id)).toMatchObject({ isHost: true, locked: false })
    expect(views.find((v) => v.id === other.id)).toMatchObject({ isHost: false, locked: true })
  })
})
