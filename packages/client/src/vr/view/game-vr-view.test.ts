// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { signal } from "@preact/signals"
import { playerId, playerName } from "@whereabouts/shared/ids"
import type { InPlayGameView } from "@whereabouts/shared/protocol/views"
import { ConnectionStatus, type Connection, type ConnectionState, type PlainState } from "../../net/net"
import type { PaintController } from "../../paint/paint-controller"
import { gameVrView } from "./game-vr-view"
import { VrViewType, type VrView } from "./view"
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
} from "../../test-view"

const bob = makePlayer({ id: playerId("p2"), name: playerName("Bob"), isHost: false, rank: 2 })

const fakeConn = (status: PlainState["type"] = ConnectionStatus.CONNECTED) =>
  ({
    status: signal<ConnectionState>({ type: status }),
    online: signal(status === ConnectionStatus.CONNECTED),
    lastError: signal<string | undefined>(undefined),
    ready: vi.fn(),
    next: vi.fn(),
    timeUntil: () => 10_000
  }) as unknown as Connection

const show = (view: InPlayGameView, conn = fakeConn(), { timeUp = false } = {}): VrView =>
  gameVrView(view, conn, {} as PaintController, {
    lockIn: vi.fn(),
    timeUp,
    outline: undefined,
    fact: undefined,
    painted: undefined,
    borders: undefined
  })

const guessing = (over: Parameters<typeof makeGuessingView>[0] = {}) => makeGuessingView(over)
const revealing = (over: Parameters<typeof makeRevealView>[0] = {}) =>
  makeRevealView({ players: [makePlayer(), bob], ...over })

const reveal = (view: VrView) => {
  if (view.type !== VrViewType.REVEAL) throw new Error(`a ${view.type} view`)
  return view.reveal
}
const round = (view: VrView) => {
  if (view.type === VrViewType.REVEAL || view.type === VrViewType.PAINT) return view.round
  throw new Error(`a ${view.type} view`)
}
const note = (view: VrView) =>
  view.type === VrViewType.PAINT || view.type === VrViewType.REVEAL ? view.round.note : undefined

describe("gameVrView", () => {
  it("tells you why you are not painting, the connection first", () => {
    expect(note(show(guessing({ you: { role: makePlaying({ locked: true }) } })))).toMatch(
      /^You're done\. .* Changed your mind\? Keep editing\.$/
    )
    expect(
      note(show(guessing({ you: { role: makePlaying({ locked: true }) } }), fakeConn(), { timeUp: true }))
    ).not.toMatch(/Keep editing/)
    expect(note(show(guessing({ you: { role: JOINED_LATE } })))).toMatch(/^You joined mid-round/)
    expect(
      note(show(guessing({ you: { role: makePlaying({ locked: true }) } }), fakeConn(ConnectionStatus.CONNECTING)))
    ).toBe("Reconnecting…")
  })

  it("lists the round's players with what each did", () => {
    const view = revealing({
      reveal: makeReveal({
        results: [
          makeResult({ score: 612.4, guess: makePainted(), hint: undefined }),
          makeResult({ playerId: bob.id, score: 250 })
        ],
        ready: [bob.id]
      })
    })
    expect(reveal(show(view)).table?.rows.map((row) => [row.name, row.detail])).toEqual([
      ["Everyone", undefined],
      ["Alice (you)", "+612"],
      ["Bob", "+250 passed, ready"],
      ["Hide paint", undefined]
    ])
    expect(reveal(show(view)).note).toBe("1 of 2 ready")
  })

  it("offers Ready until pressed, and the host the next round", () => {
    const labels = (view: InPlayGameView) => reveal(show(view)).actions.map((action) => [action.label, action.enabled])
    expect(labels(revealing())).toEqual([
      ["Ready", true],
      ["Next round", true]
    ])
    expect(labels(revealing({ you: { isHost: false }, reveal: makeReveal({ ready: [playerId("p1")] }) }))).toEqual([
      ["Waiting for the others…", false]
    ])
  })

  it("offers nothing to press while reconnecting, since it would be lost", () => {
    const enabled = reveal(show(revealing(), fakeConn(ConnectionStatus.CONNECTING))).actions.map(
      (action) => action.enabled
    )
    expect(enabled).toEqual([false, false])
  })

  it("lists the players still playing, by rank, with their state", () => {
    const view = guessing({
      players: [
        makePlayer({ id: playerId("p3"), name: playerName("Cy"), rank: 3, connected: false }),
        makePlayer({ locked: true, rank: 2 }),
        { ...bob, rank: 1 }
      ],
      spectators: [makeSpectator({ id: playerId("p4"), name: playerName("Dee") })]
    })
    expect(round(show(view)).table?.rows.map((row) => [row.name, row.detail])).toEqual([
      ["Bob", "guessing"],
      ["Alice (you)", "done"],
      ["Cy", "away"]
    ])
  })

  it("puts Leave game last, and End game only for the host before the last reveal", () => {
    const labels = (view: InPlayGameView) => show(view).more?.map((action) => action.label)
    expect(labels(guessing())).toEqual(["End game", "Leave game"])
    expect(labels(guessing({ you: { isHost: false } }))).toEqual(["Leave game"])
    expect(labels(guessing({ you: { role: SPECTATING, isHost: false } }))).toEqual([
      "Play from the next question",
      "Leave game"
    ])
    expect(labels(revealing({ reveal: makeReveal({ index: 4 }) }))).toEqual(["Leave game"])
  })
})
