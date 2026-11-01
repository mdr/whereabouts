// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test"
import { act, renderHook } from "@testing-library/preact"
import { signal } from "@preact/signals"
import { h3Res } from "@whereabouts/shared/h3"
import { PaintLayer } from "@whereabouts/shared/paint/paint"
import type { GuessingYouView, InPlayGameView } from "@whereabouts/shared/protocol"
import { ConnectionStatus, type ConnectionState } from "../net/net"
import { usePaintUpload } from "./paint-upload"
import { JOINED_LATE, SPECTATING, makeGuessingView, makePlaying } from "../test-view"

const CELL = "85283473fffffff"

function makePaint(cells: Record<string, number> = { [CELL]: 1 }) {
  return { layer: PaintLayer.fromRecord(h3Res(5), cells), floor: signal(0.05), version: signal(0) }
}

/** Make a change, and run the renders and effects it causes. */
function run(change: () => unknown) {
  void act(() => void change())
}
const wait = (ms: number) => run(() => vi.advanceTimersByTime(ms))

const guessing = (you: Partial<GuessingYouView> = {}) => makeGuessingView({ you })

interface Props {
  view: InPlayGameView
  timeUp: boolean
}

function setup({
  view = guessing(),
  paint = makePaint()
}: { view?: InPlayGameView; paint?: ReturnType<typeof makePaint> } = {}) {
  const conn = {
    status: signal<ConnectionState>({ type: ConnectionStatus.CONNECTED }),
    sendPaint: vi.fn(),
    lock: vi.fn()
  }
  let props: Props = { view, timeUp: false }
  const hook = renderHook((hookProps: Props) => usePaintUpload(conn, paint, hookProps.view, hookProps.timeUp), {
    initialProps: props
  })
  const update = (over: Partial<Props>) => {
    props = { ...props, ...over }
    hook.rerender(props)
  }
  const edit = () => run(() => paint.version.value++)
  const settle = () => wait(400)
  // The upload a fresh round makes on its own, out of the way.
  settle()
  conn.sendPaint.mockClear()
  return { conn, paint, hook, update, edit, settle }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("usePaintUpload", () => {
  it("uploads once, 400 ms after the last of a run of changes", () => {
    const { conn, edit } = setup()
    edit()
    wait(300)
    edit()
    wait(300)
    expect(conn.sendPaint).not.toHaveBeenCalled()
    wait(100)
    expect(conn.sendPaint).toHaveBeenCalledTimes(1)
    expect(conn.sendPaint).toHaveBeenCalledWith({ cells: { [CELL]: 1 }, floor: 0.05 })
  })

  it("uploads a change of floor too", () => {
    const { conn, paint, settle } = setup()
    run(() => (paint.floor.value = 0.2))
    settle()
    expect(conn.sendPaint).toHaveBeenCalledWith(expect.objectContaining({ floor: 0.2 }))
  })

  it("uploads an empty map, taking back earlier paint", () => {
    const { conn, edit, settle } = setup({ paint: makePaint({}) })
    edit()
    settle()
    expect(conn.sendPaint).toHaveBeenCalledWith({ cells: {}, floor: 0.05 })
  })

  it("uploads at once when time is up, and nothing after", () => {
    const { conn, edit, update, settle } = setup()
    edit()
    update({ timeUp: true })
    expect(conn.sendPaint).toHaveBeenCalledTimes(1)
    settle()
    edit()
    settle()
    expect(conn.sendPaint).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["watching the game", { role: SPECTATING }],
    ["sitting out a round joined late", { role: JOINED_LATE }],
    ["locked", { role: makePlaying({ locked: true }) }]
  ])("uploads nothing while %s", (_, you) => {
    const { conn, edit, update, settle } = setup({ view: guessing(you) })
    edit()
    settle()
    update({ timeUp: true })
    expect(conn.sendPaint).not.toHaveBeenCalled()
  })

  it.each([
    ["watching the game", { role: SPECTATING }],
    ["locked", { role: makePlaying({ locked: true }) }]
  ])("drops a pending upload on becoming %s", (_, you) => {
    const { conn, edit, update, settle } = setup()
    edit()
    update({ view: guessing(you) })
    settle()
    expect(conn.sendPaint).not.toHaveBeenCalled()
  })

  it("uploads again after a reconnect, once the server's next state arrives", () => {
    const { conn, update } = setup()
    run(() => (conn.status.value = { type: ConnectionStatus.DISCONNECTED }))
    run(() => (conn.status.value = { type: ConnectionStatus.CONNECTED }))
    expect(conn.sendPaint).not.toHaveBeenCalled()
    update({ view: guessing() })
    expect(conn.sendPaint).toHaveBeenCalledTimes(1)
    update({ view: guessing() })
    expect(conn.sendPaint).toHaveBeenCalledTimes(1)
  })

  it("does not upload after a reconnect once time is up", () => {
    const { conn, update } = setup()
    update({ timeUp: true })
    conn.sendPaint.mockClear()
    run(() => (conn.status.value = { type: ConnectionStatus.DISCONNECTED }))
    run(() => (conn.status.value = { type: ConnectionStatus.CONNECTED }))
    update({ view: guessing() })
    expect(conn.sendPaint).not.toHaveBeenCalled()
  })

  it("locks after a reconnect when Done was pressed while the connection was down", () => {
    const { conn, hook, update } = setup()
    run(() => (conn.status.value = { type: ConnectionStatus.DISCONNECTED }))
    hook.result.current.lockIn()
    conn.sendPaint.mockClear()
    conn.lock.mockClear()
    run(() => (conn.status.value = { type: ConnectionStatus.CONNECTED }))
    update({ view: guessing() })
    expect(conn.lock).toHaveBeenCalledTimes(1)
    expect(conn.sendPaint.mock.invocationCallOrder[0]).toBeLessThan(conn.lock.mock.invocationCallOrder[0]!)
    update({ view: guessing() })
    expect(conn.lock).toHaveBeenCalledTimes(1)
  })

  it("does not lock again after a reconnect once Done was taken back", () => {
    const { conn, hook, update } = setup()
    hook.result.current.lockIn()
    update({ view: guessing({ role: makePlaying({ locked: true }) }) })
    update({ view: guessing() })
    conn.lock.mockClear()
    run(() => (conn.status.value = { type: ConnectionStatus.DISCONNECTED }))
    run(() => (conn.status.value = { type: ConnectionStatus.CONNECTED }))
    update({ view: guessing() })
    expect(conn.lock).not.toHaveBeenCalled()
  })

  it("uploads before locking on Done, in place of a pending upload", () => {
    const { conn, edit, hook, settle } = setup()
    edit()
    hook.result.current.lockIn()
    expect(conn.sendPaint).toHaveBeenCalledTimes(1)
    expect(conn.sendPaint.mock.invocationCallOrder[0]).toBeLessThan(conn.lock.mock.invocationCallOrder[0]!)
    settle()
    expect(conn.sendPaint).toHaveBeenCalledTimes(1)
  })
})
