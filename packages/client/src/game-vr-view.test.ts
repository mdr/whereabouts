// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { signal } from "@preact/signals"
import { playerId, playerName } from "@whereabouts/shared/ids"
import { Phase, type GameView } from "@whereabouts/shared/protocol"
import { ConnectionStatus, type Connection } from "./net"
import type { PaintController } from "./paint-controller"
import { gameVrView } from "./game-vr-view"
import { VrViewType, type VrView } from "./vr/view"
import { makePlayer, makeResult, makeReveal, makeView } from "./test-view"

const bob = makePlayer({ id: playerId("p2"), name: playerName("Bob"), isHost: false, rank: 2 })

function fakeConn(status = ConnectionStatus.CONNECTED) {
  return {
    status: signal(status),
    online: signal(status === ConnectionStatus.CONNECTED),
    lastError: signal<string | undefined>(undefined),
    ready: vi.fn(),
    next: vi.fn(),
    timeUntil: () => 10_000
  } as unknown as Connection
}

const show = (view: GameView, conn = fakeConn(), { timeUp = false } = {}): VrView =>
  gameVrView(view, conn, {} as PaintController, {
    lockIn: vi.fn(),
    timeUp,
    outline: undefined,
    fact: undefined,
    painted: undefined,
    borders: undefined
  })

const guessing = (over: Parameters<typeof makeView>[0] = {}) =>
  makeView({
    phase: Phase.GUESSING,
    round: { index: 0, total: 5, question: makeReveal().question, deadline: 0 },
    ...over
  })
const revealing = (over: Parameters<typeof makeView>[0] = {}) =>
  makeView({ phase: Phase.REVEAL, players: [makePlayer(), bob], reveal: makeReveal(), ...over })

const reveal = (v: VrView) => {
  if (v.type !== VrViewType.REVEAL) throw new Error(`a ${v.type} view`)
  return v.reveal
}
const note = (v: VrView) => (v.type === VrViewType.PAINT || v.type === VrViewType.REVEAL ? v.round.note : undefined)

describe("gameVrView", () => {
  it("tells you why you are not painting, the connection first", () => {
    expect(note(show(guessing({ you: { locked: true } })))).toMatch(
      /^You're done\. .* Changed your mind\? Keep editing\.$/
    )
    expect(note(show(guessing({ you: { locked: true } }), fakeConn(), { timeUp: true }))).not.toMatch(/Keep editing/)
    expect(note(show(guessing({ you: { sittingOut: true } })))).toMatch(/^You joined mid-round/)
    expect(note(show(guessing({ you: { locked: true } }), fakeConn(ConnectionStatus.CONNECTING)))).toBe("Reconnecting…")
  })

  it("lists the round's players with what each did", () => {
    const view = revealing({
      reveal: makeReveal({
        results: [
          makeResult({ score: 612.4, paint: { cells: {}, floor: 0 }, hint: undefined }),
          makeResult({ playerId: bob.id, score: 250 })
        ],
        ready: [bob.id]
      })
    })
    expect(reveal(show(view)).table?.rows.map((r) => [r.name, r.detail])).toEqual([
      ["Everyone", undefined],
      ["Alice (you)", "+612"],
      ["Bob", "+250 passed, ready"],
      ["Hide paint", undefined]
    ])
    expect(reveal(show(view)).note).toBe("1 of 2 ready")
  })

  it("offers Ready until pressed, and the host the next round", () => {
    const labels = (v: GameView) => reveal(show(v)).actions.map((a) => [a.label, a.enabled])
    expect(labels(revealing())).toEqual([
      ["Ready", true],
      ["Next round", true]
    ])
    expect(labels(revealing({ you: { isHost: false }, reveal: makeReveal({ ready: [playerId("p1")] }) }))).toEqual([
      ["Waiting for the others…", false]
    ])
  })

  it("offers nothing to press while reconnecting, since it would be lost", () => {
    const enabled = reveal(show(revealing(), fakeConn(ConnectionStatus.CONNECTING))).actions.map((a) => a.enabled)
    expect(enabled).toEqual([false, false])
  })
})
