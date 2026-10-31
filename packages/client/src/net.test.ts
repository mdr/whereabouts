// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import type { WSClientOptions } from "@rivalis/browser"
import { CLOSE_REASONS } from "@whereabouts/shared/close-reason"
import { playerName, playerToken, roomCode } from "@whereabouts/shared/ids"
import { decodePaint, encodePaint } from "@whereabouts/shared/paint-wire"
import {
  decodeTicket,
  revealMessage,
  stateMessage,
  type GameView,
  type RoundReveal,
  type Ticket
} from "@whereabouts/shared/protocol"
import { Connection, describeDisconnect, type GameClient } from "./net"
import { makeView } from "./test-view"

describe("describeDisconnect", () => {
  it("words every reason the server can give", () => {
    for (const reason of CLOSE_REASONS) expect(describeDisconnect(4001, reason).title).not.toBe("Disconnected")
  })

  it("explains a destroyed room in player terms", () => {
    const r = describeDisconnect(1000, "room_destroyed")
    expect(r.title).toBe("That game has ended")
    expect(r.detail).toContain("Everyone left")
  })

  it("offers hosting under a missing code, and forgets the seat of a removed player", () => {
    expect(describeDisconnect(4001, "noSuchGame")).toMatchObject({ title: "No game with that code", missing: true })
    expect(describeDisconnect(1000, "full").missing).toBeUndefined()
    expect(describeDisconnect(1000, "removed")).toMatchObject({
      title: "You were removed from the game",
      removed: true
    })
    expect(describeDisconnect(1000, "full").detail).toContain("16 players and 8 people watching")
    expect(describeDisconnect(0, "reconnect_failed").title).toBe("Lost the connection")
  })

  it("falls back to the raw reason or the close code", () => {
    expect(describeDisconnect(1006, undefined).detail).toContain("1006")
    expect(describeDisconnect(1000, "something odd").detail).toBe("something odd")
  })
})

const encoder = new TextEncoder()

class FakeClient implements GameClient {
  connected = false
  readonly tickets: string[] = []
  readonly sent: string[] = []
  private readonly listeners = new Map<string, (arg?: unknown) => void>()

  readonly options: WSClientOptions

  constructor(options: WSClientOptions) {
    this.options = options
  }

  connect(ticket: string): void {
    this.tickets.push(ticket)
  }
  disconnect(): void {
    this.connected = false
  }
  send(topic: string): void {
    this.sent.push(topic)
  }
  on(event: string, listener: (arg: never) => void): this {
    this.listeners.set(event, listener as (arg?: unknown) => void)
    return this
  }

  emit(event: string, arg?: unknown): void {
    this.listeners.get(event)?.(arg)
  }
  open(): void {
    this.connected = true
    this.emit("client:connect")
  }
  close(): void {
    this.connected = false
    this.emit("client:disconnect")
  }
  state(view: GameView): void {
    this.emit("state", encoder.encode(JSON.stringify(stateMessage(view))))
  }
  async nextTicket(): Promise<Ticket | "outdated" | undefined> {
    return decodeTicket(await this.options.getTicket!())
  }
}

const TICKET = { token: playerToken("t".repeat(16)), name: playerName("Alice"), create: true }

function connected() {
  const clients: FakeClient[] = []
  const conn = new Connection((_url, options) => {
    const c = new FakeClient(options)
    clients.push(c)
    return c
  })
  conn.connect(TICKET)
  return { conn, client: clients[0]!, clients }
}

describe("Connection status", () => {
  afterEach(() => vi.useRealTimers())

  it("is connecting while it dials, and connected once in", () => {
    const { conn, client } = connected()
    expect(conn.status.value).toBe("connecting")
    client.open()
    expect(conn.status.value).toBe("connected")
  })

  it("is disconnected when a connection drops", () => {
    const { conn, client } = connected()
    client.open()
    client.close()
    expect(conn.status.value).toBe("disconnected")
  })

  it("is still connecting while it retries before the first state arrives", () => {
    const { conn, client } = connected()
    client.open()
    client.close()
    client.emit("client:reconnecting")
    expect(conn.status.value).toBe("connecting")
  })

  it("stays disconnected while it retries a game it was in", () => {
    const { conn, client } = connected()
    client.open()
    client.state(makeView())
    client.close()
    client.emit("client:reconnecting")
    expect(conn.status.value).toBe("disconnected")
  })

  it("stays rejected, with the reason, when the close follows a rejection", () => {
    const { conn, client } = connected()
    client.open()
    client.emit("client:kicked", { code: 4003, reason: "full" })
    client.close()
    expect(conn.status.value).toBe("rejected")
    expect(conn.rejection.value?.title).toBe("That game is full")
  })

  it("stays rejected if a retry follows the rejection", () => {
    const { conn, client } = connected()
    client.open()
    client.emit("client:kicked", { code: 4003, reason: "full" })
    client.close()
    client.emit("client:reconnecting")
    expect(conn.status.value).toBe("rejected")
    expect(conn.rejection.value?.title).toBe("That game is full")
  })

  it("is rejected when it gives up reconnecting, keeping an earlier reason", () => {
    const { conn, client } = connected()
    client.emit("client:reconnect_failed")
    expect(conn.status.value).toBe("rejected")
    expect(conn.rejection.value?.title).toBe("Lost the connection")

    const other = connected()
    other.client.emit("client:kicked", { code: 4003, reason: "removed" })
    other.client.emit("client:reconnect_failed")
    expect(other.conn.rejection.value?.removed).toBe(true)
  })

  it("is idle after disconnecting, unless it was rejected", () => {
    const { conn, client } = connected()
    client.open()
    conn.disconnect()
    expect(conn.status.value).toBe("idle")

    const other = connected()
    other.client.emit("client:kicked", { code: 4003, reason: "finished" })
    other.conn.disconnect()
    expect(other.conn.status.value).toBe("rejected")
  })

  it("comes back to the same game, never hosting another", async () => {
    const { client } = connected()
    expect(await client.nextTicket()).toMatchObject({ create: true })
    expect(await client.nextTicket()).not.toHaveProperty("code")
    client.open()
    client.state(makeView({ code: roomCode("WXYZ") }))
    expect(await client.nextTicket()).toMatchObject({ create: false, code: "WXYZ", name: "Alice" })
  })

  it("tries again a moment after the server sheds it for sending too much, rejoining its game", async () => {
    vi.useFakeTimers()
    const { conn, client, clients } = connected()
    client.open()
    client.state(makeView({ code: roomCode("WXYZ") }))
    client.emit("client:kicked", { code: 4003, reason: "rate_limited" })
    expect(conn.status.value).not.toBe("rejected")
    vi.advanceTimersByTime(1000)
    expect(clients).toHaveLength(2)
    expect(decodeTicket(clients[1]!.tickets[0]!)).toMatchObject({ create: false, code: "WXYZ" })
  })

  it("leaves a connection refused for the network's rate to the client's own retries", () => {
    vi.useFakeTimers()
    const { conn, client, clients } = connected()
    client.emit("client:kicked", { code: 4005, reason: "rate_limited" })
    vi.advanceTimersByTime(5000)
    expect(clients).toHaveLength(1)
    expect(conn.status.value).toBe("connecting")
  })
})

describe("Connection view", () => {
  afterEach(() => vi.useRealTimers())

  it("shows each state, with the server's clock offset, and clears an old error", () => {
    vi.useFakeTimers({ now: 10_000 })
    const { conn, client } = connected()
    client.open()
    client.emit("error", encoder.encode(JSON.stringify({ message: "Too slow" })))
    expect(conn.lastError.value).toBe("Too slow")
    client.state(makeView({ phase: "guessing", serverTime: 12_500 }))
    expect(conn.view.value?.phase).toBe("guessing")
    expect(conn.clockOffset.value).toBe(2500)
    expect(conn.lastError.value).toBeUndefined()
  })

  it("hands back your paint while guessing, but not paint from before a reconnect", () => {
    const paint = { cells: { "85283473fffffff": 1 }, floor: 0.05 }
    const { conn, client } = connected()
    client.open()
    client.emit("paint", encodePaint(paint))
    client.state(makeView({ phase: "guessing" }))
    expect(conn.view.value?.you.paint).toEqual(decodePaint(encodePaint(paint)))

    client.close()
    client.open()
    client.state(makeView({ phase: "guessing" }))
    expect(conn.view.value?.you.paint).toBeUndefined()
  })

  it("shows a reveal with the state of its round", () => {
    const reveal: RoundReveal = {
      index: 2,
      total: 5,
      question: { prompt: "Where is Kyoto?", toleranceKm: 50 },
      answer: { lat: 35, lon: 135.8 },
      label: "Kyoto",
      results: []
    }
    const at = (index: number) => makeView({ phase: "reveal", reveal: { ...reveal, index, ready: [] } })
    const { conn, client } = connected()
    client.open()
    client.emit("reveal", encoder.encode(JSON.stringify(revealMessage(reveal))))
    client.state(at(1))
    expect(conn.view.value?.reveal).toBeUndefined()
    client.state(at(2))
    expect(conn.view.value?.reveal?.label).toBe("Kyoto")
  })

  it("sends only while connected", () => {
    const { conn, client } = connected()
    conn.lock()
    conn.sendPaint({ cells: {}, floor: 0 })
    expect(client.sent).toEqual([])
    client.open()
    conn.lock()
    conn.sendPaint({ cells: {}, floor: 0 })
    expect(client.sent).toEqual(["lock", "paint"])
  })
})
