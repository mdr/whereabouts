import { describe, expect, it } from "vite-plus/test"
import { playerId, playerName } from "@whereabouts/shared/ids"
import { SHOW_EVERYONE, SHOW_NOBODY, showPlayer, type RevealShown } from "./reveal"
import { RoundNote, ShownRowType, canEndGame, revealModel, roundNote, type ShownRow } from "./round-model"
import {
  JOINED_LATE,
  SPECTATING,
  makePainted,
  makePlaying,
  makePlayer,
  makeResult,
  makeGuessingView,
  makeReveal,
  makeRevealView,
  makeSpectator
} from "../test-view"

const alice = makePlayer()
const bob = makePlayer({ id: playerId("p2"), name: playerName("Bob"), isHost: false, rank: 2 })
const sam = makeSpectator()

const you = (over: Parameters<typeof makeGuessingView>[0] = {}) => makeGuessingView({ ...over }).you

describe("roundNote", () => {
  it("says nothing while you are painting", () => {
    expect(roundNote(you())).toBeUndefined()
  })

  it("tells a watcher, a late joiner and someone done apart", () => {
    expect(roundNote(you({ you: { role: SPECTATING } }))).toBe(RoundNote.WATCHING)
    expect(roundNote(you({ you: { role: JOINED_LATE } }))).toBe(RoundNote.JOINED_LATE)
    expect(roundNote(you({ you: { role: makePlaying({ locked: true }) } }))).toBe(RoundNote.DONE)
  })
})

describe("canEndGame", () => {
  it("is the host's, until the last reveal", () => {
    expect(canEndGame(makeGuessingView())).toBe(true)
    expect(canEndGame(makeGuessingView({ you: { isHost: false } }))).toBe(false)
    expect(canEndGame(makeRevealView({ reveal: makeReveal({ index: 3, total: 5 }) }))).toBe(true)
    expect(canEndGame(makeRevealView({ reveal: makeReveal({ index: 4, total: 5 }) }))).toBe(false)
  })
})

describe("revealModel", () => {
  const players = [alice, bob]
  const model = (
    over: Parameters<typeof makeRevealView>[0] = {},
    reveal = makeReveal(),
    shown: RevealShown = SHOW_EVERYONE
  ) => revealModel(makeRevealView({ players, spectators: [sam], ...over }), reveal, shown)
  const names = (rows: ShownRow[]) => rows.map((row) => (row.type === ShownRowType.PLAYER ? row.player.name : row.type))

  it("lists Everyone, the players by this round's score, then Hide paint", () => {
    const reveal = makeReveal({ results: [makeResult({ score: 300 }), makeResult({ playerId: bob.id, score: 700 })] })
    expect(names(model({}, reveal).rows)).toEqual([ShownRowType.EVERYONE, "Bob", "Alice", ShownRowType.HIDE_PAINT])
  })

  it("marks you, who is ready, and who sat the round out", () => {
    const reveal = makeReveal({ results: [makeResult({ playerId: bob.id, guess: makePainted() })], ready: [bob.id] })
    const rows = model({}, reveal).rows.filter((row) => row.type === ShownRowType.PLAYER)
    expect(rows.map((row) => [row.player.name, row.you, row.ready, row.result?.score])).toEqual([
      ["Bob", false, true, 500],
      ["Alice", true, false, undefined]
    ])
  })

  it("selects whose paint shows, and picking the selected row again shows everyone", () => {
    const pick = (shown: RevealShown) => model({}, makeReveal(), shown).rows.map((row) => [row.selected, row.pick])
    expect(pick(SHOW_EVERYONE)).toEqual([
      [true, SHOW_EVERYONE],
      [false, showPlayer(alice.id)],
      [false, showPlayer(bob.id)],
      [false, SHOW_NOBODY]
    ])
    expect(pick(showPlayer(bob.id))[2]).toEqual([true, SHOW_EVERYONE])
    expect(pick(SHOW_NOBODY)[3]).toEqual([true, SHOW_EVERYONE])
  })

  it("counts who is ready among the players here, leaving out watchers and anyone away", () => {
    const away = { ...bob, connected: false }
    const reveal = makeReveal({ ready: [alice.id, bob.id, sam.id] })
    expect(model({ players: [alice, away] }, reveal)).toMatchObject({ readyCount: 1, presentCount: 1 })
  })

  it("offers Ready to a player, done once pressed, and none to a watcher", () => {
    expect(model().ready).toEqual({ done: false })
    expect(model({}, makeReveal({ ready: [alice.id] })).ready).toEqual({ done: true })
    expect(model({ you: { role: SPECTATING } }).ready).toBeUndefined()
  })

  it("gives the host the way on, ending the game at the last round", () => {
    expect(model().next).toEqual({ label: "Next round" })
    expect(model({}, makeReveal({ index: 4, total: 5 })).next).toEqual({ label: "Show final results" })
    expect(model({ you: { isHost: false } }).next).toBeUndefined()
  })
})
