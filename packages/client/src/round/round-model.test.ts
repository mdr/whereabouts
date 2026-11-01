import { describe, expect, it } from "vite-plus/test"
import { playerId, playerName } from "@whereabouts/shared/ids"
import { Phase } from "@whereabouts/shared/protocol"
import { NONE } from "./reveal"
import { RoundNote, ShownRowType, canEndGame, revealModel, roundNote, type ShownRow } from "./round-model"
import { makePlayer, makeResult, makeReveal, makeView } from "../test-view"

const alice = makePlayer()
const bob = makePlayer({ id: playerId("p2"), name: playerName("Bob"), isHost: false, rank: 2 })
const sam = makePlayer({ id: playerId("p3"), name: playerName("Sam"), isHost: false, watching: true })
const painted = { cells: { "85283473fffffff": 1 }, floor: 0.05 }

const you = (over: Parameters<typeof makeView>[0] = {}) => makeView({ phase: Phase.GUESSING, ...over }).you

describe("roundNote", () => {
  it("says nothing while you are painting", () => {
    expect(roundNote(you())).toBeUndefined()
  })

  it("tells a watcher, a late joiner and someone done apart", () => {
    expect(roundNote(you({ you: { watching: true, sittingOut: true } }))).toBe(RoundNote.WATCHING)
    expect(roundNote(you({ you: { sittingOut: true } }))).toBe(RoundNote.JOINED_LATE)
    expect(roundNote(you({ you: { locked: true } }))).toBe(RoundNote.DONE)
  })
})

describe("canEndGame", () => {
  it("is the host's, until the last reveal", () => {
    expect(canEndGame(makeView({ phase: Phase.GUESSING }))).toBe(true)
    expect(canEndGame(makeView({ phase: Phase.GUESSING, you: { isHost: false } }))).toBe(false)
    expect(canEndGame(makeView({ phase: Phase.REVEAL, reveal: makeReveal({ index: 3, total: 5 }) }))).toBe(true)
    expect(canEndGame(makeView({ phase: Phase.REVEAL, reveal: makeReveal({ index: 4, total: 5 }) }))).toBe(false)
  })
})

describe("revealModel", () => {
  const players = [alice, bob, sam]
  const model = (over: Parameters<typeof makeView>[0] = {}, reveal = makeReveal(), shown?: string) =>
    revealModel(makeView({ phase: Phase.REVEAL, players, ...over }), reveal, shown)
  const names = (rows: ShownRow[]) => rows.map((r) => (r.type === ShownRowType.PLAYER ? r.player.name : r.type))

  it("lists Everyone, the players by this round's score, then Hide paint", () => {
    const reveal = makeReveal({ results: [makeResult({ score: 300 }), makeResult({ playerId: bob.id, score: 700 })] })
    expect(names(model({}, reveal).rows)).toEqual([ShownRowType.EVERYONE, "Bob", "Alice", ShownRowType.HIDE_PAINT])
  })

  it("marks you, who is ready, and who sat the round out", () => {
    const reveal = makeReveal({ results: [makeResult({ playerId: bob.id, paint: painted })], ready: [bob.id] })
    const rows = model({}, reveal).rows.filter((r) => r.type === ShownRowType.PLAYER)
    expect(rows.map((r) => [r.player.name, r.you, r.ready, r.result?.score])).toEqual([
      ["Bob", false, true, 500],
      ["Alice", true, false, undefined]
    ])
  })

  it("selects whose paint shows, and picking the selected row again shows everyone", () => {
    const pick = (shown: string | undefined) => model({}, makeReveal(), shown).rows.map((r) => [r.selected, r.pick])
    expect(pick(undefined)).toEqual([
      [true, undefined],
      [false, alice.id],
      [false, bob.id],
      [false, NONE]
    ])
    expect(pick(bob.id)[2]).toEqual([true, undefined])
    expect(pick(NONE)[3]).toEqual([true, undefined])
  })

  it("counts who is ready among the players here, leaving out watchers and anyone away", () => {
    const away = { ...bob, connected: false }
    const reveal = makeReveal({ ready: [alice.id, bob.id, sam.id] })
    expect(model({ players: [alice, away, sam] }, reveal)).toMatchObject({ readyCount: 1, presentCount: 1 })
  })

  it("offers Ready to a player, done once pressed, and none to a watcher", () => {
    expect(model().ready).toEqual({ done: false })
    expect(model({}, makeReveal({ ready: [alice.id] })).ready).toEqual({ done: true })
    expect(model({ you: { watching: true, sittingOut: true } }).ready).toBeUndefined()
  })

  it("gives the host the way on, ending the game at the last round", () => {
    expect(model().next).toEqual({ label: "Next round" })
    expect(model({}, makeReveal({ index: 4, total: 5 })).next).toEqual({ label: "Show final results" })
    expect(model({ you: { isHost: false } }).next).toBeUndefined()
  })
})
