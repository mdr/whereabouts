import { describe, expect, it } from "vite-plus/test"
import { playerColour } from "../colours.ts"
import { playerId, playerToken, type PlayerName } from "../ids.ts"
import { Role } from "../roles.ts"
import { freshRecord, type PlayerRecord, type PlayerSeat, type Seat } from "./seats.ts"
import { finalStandings, rankAmong, rosterView } from "./standings.ts"

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
    expect(first).toEqual({
      playerId: late.id,
      name: late.name,
      colour: playerColour(0),
      total: 700,
      rounds: [{}, {}, { score: 700 }]
    })
    expect(second).toEqual({
      playerId: early.id,
      name: early.name,
      colour: playerColour(0),
      total: 600,
      rounds: [{ score: 100 }, { score: 200 }, { score: 300 }]
    })
  })

  it("orders tied totals by name, as the reveal does, whatever order the seats are in", () => {
    const zoe = makePlayerSeat({ scores: [250] }, { name: "Zoe" as PlayerName })
    const amy = makePlayerSeat({ scores: [250] }, { name: "Amy" as PlayerName })
    expect(finalStandings([zoe, amy], 1).map((standing) => standing.name)).toEqual(["Amy", "Zoe"])
  })
})

describe("rankAmong", () => {
  it("gives tied totals one rank and skips the next", () => {
    const first = makePlayerSeat({ scores: [50] })
    const second = makePlayerSeat({ scores: [50] })
    const third = makePlayerSeat({ scores: [10] })
    const all = [first, second, third]
    expect(all.map((player) => rankAmong(player, all))).toEqual([1, 1, 3])
  })
})

describe("rosterView", () => {
  it("lists players by rank then name, and spectators apart by name", () => {
    const zed = makePlayerSeat({ scores: [10] }, { name: "Zed" as PlayerName })
    const amy = makePlayerSeat({ scores: [10] }, { name: "Amy" as PlayerName })
    const top = makePlayerSeat({ scores: [90] }, { name: "Top" as PlayerName })
    const wes = makeSpectatorSeat({ name: "Wes" as PlayerName })
    const aaa = makeSpectatorSeat({ name: "Aaa" as PlayerName })
    const { players, spectators } = rosterView([zed, wes, amy, aaa, top], undefined, () => false)
    expect(players.map((view) => [view.name, view.rank])).toEqual([
      ["Top", 1],
      ["Amy", 2],
      ["Zed", 2]
    ])
    expect(spectators.map((view) => view.name)).toEqual(["Aaa", "Wes"])
  })

  it("marks the host and who has locked in", () => {
    const host = makePlayerSeat()
    const other = makePlayerSeat()
    const { players } = rosterView([host, other], host.token, (token) => token === other.token)
    expect(players.find((view) => view.id === host.id)).toMatchObject({ isHost: true, locked: false })
    expect(players.find((view) => view.id === other.id)).toMatchObject({ isHost: false, locked: true })
  })
})
