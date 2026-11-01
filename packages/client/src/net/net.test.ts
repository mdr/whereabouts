// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import type { WSClientOptions } from "@rivalis/browser"
import { CloseReason } from "@whereabouts/shared/close-reason"
import { placeId, playerName, playerToken, roomCode, wikiTitle } from "@whereabouts/shared/ids"
import { viewIn } from "@whereabouts/shared/game/view-in"
import { decodePaint, encodePaint } from "@whereabouts/shared/paint/paint-wire"
import {
  GameEntryType,
  decodeTicket,
  revealMessage,
  stateMessage,
  type GameView,
  type RoundReveal,
  type Ticket,
  Phase
} from "@whereabouts/shared/protocol"
import {
  Connection,
  ConnectionStatus,
  RejectionAction,
  describeDisconnect,
  type GameClient,
  type Rejection
} from "./net"
import { makeGuessingView, makeLobbyView, makeQuestionView, makeRevealView } from "../test-view"
import { PING_EVERY, PONG_WITHIN } from "./heartbeat"

describe("describeDisconnect", () => {
  it("words every reason the server can give", () => {
    for (const reason of Object.values(CloseReason))
      expect(describeDisconnect(4001, reason).title).not.toBe("Disconnected")
  })

  it("explains a destroyed room in player terms", () => {
    const r = describeDisconnect(1000, "room_destroyed")
    expect(r.title).toBe("That game has ended")
    expect(r.detail).toContain("Everyone left")
  })

  it("offers hosting under a missing code, and forgets the seat of a removed player", () => {
    expect(describeDisconnect(4001, CloseReason.NO_SUCH_GAME)).toMatchObject({
      title: "No game with that code",
      action: RejectionAction.HOST_UNDER_CODE
    })
    expect(describeDisconnect(1000, CloseReason.FULL).action).toBe(RejectionAction.NONE)
    expect(describeDisconnect(1000, CloseReason.REMOVED)).toMatchObject({
      title: "You were removed from the game",
      action: RejectionAction.FORGET_SEAT
    })
    expect(describeDisconnect(1000, CloseReason.FULL).detail).toContain("16 players and 8 people watching")
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
  async nextTicket(): Promise<Ticket | CloseReason.OUTDATED | undefined> {
    return decodeTicket(await this.options.getTicket!())
  }
}

const TICKET = {
  token: playerToken("t".repeat(16)),
  name: playerName("Alice"),
  entry: { type: GameEntryType.HOST as const }
}

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

const rejectionOf = (conn: Connection): Rejection | undefined =>
  conn.status.value.type === ConnectionStatus.REJECTED ? conn.status.value.rejection : undefined

describe("Connection status", () => {
  afterEach(() => vi.useRealTimers())

  it("is connecting while it dials, and connected once in", () => {
    const { conn, client } = connected()
    expect(conn.status.value.type).toBe(ConnectionStatus.CONNECTING)
    client.open()
    expect(conn.status.value.type).toBe(ConnectionStatus.CONNECTED)
  })

  it("is disconnected when a connection drops", () => {
    const { conn, client } = connected()
    client.open()
    client.close()
    expect(conn.status.value.type).toBe(ConnectionStatus.DISCONNECTED)
  })

  it("is still connecting while it retries before the first state arrives", () => {
    const { conn, client } = connected()
    client.open()
    client.close()
    client.emit("client:reconnecting")
    expect(conn.status.value.type).toBe(ConnectionStatus.CONNECTING)
  })

  it("stays disconnected while it retries a game it was in", () => {
    const { conn, client } = connected()
    client.open()
    client.state(makeLobbyView())
    client.close()
    client.emit("client:reconnecting")
    expect(conn.status.value.type).toBe(ConnectionStatus.DISCONNECTED)
  })

  it("gives up getting in after 20 tries, offering to try again", () => {
    const { conn, client } = connected()
    client.emit("client:reconnecting", encoder.encode("20"))
    expect(conn.status.value.type).toBe(ConnectionStatus.CONNECTING)
    client.emit("client:reconnecting", encoder.encode("21"))
    expect(conn.status.value.type).toBe(ConnectionStatus.REJECTED)
    expect(rejectionOf(conn)).toMatchObject({ title: "Lost the connection", action: RejectionAction.RETRY })
  })

  it("keeps trying to get back into a game for as long as it takes", () => {
    const { conn, client } = connected()
    client.open()
    client.state(makeLobbyView())
    client.close()
    client.emit("client:reconnecting", encoder.encode("500"))
    expect(conn.status.value.type).toBe(ConnectionStatus.DISCONNECTED)
  })

  it("tries again with a fresh connection, back into the game it was in", () => {
    const { conn, client, clients } = connected()
    client.open()
    client.state(makeLobbyView({ code: roomCode("WXYZ") }))
    client.emit("client:reconnect_failed")
    conn.rejoin()
    expect(conn.status.value.type).toBe(ConnectionStatus.CONNECTING)
    expect(decodeTicket(clients[1]!.tickets[0]!)).toMatchObject({
      entry: { type: GameEntryType.JOIN, code: "WXYZ" },
      name: "Alice"
    })
  })

  it("stays rejected, with the reason, when the close follows a rejection", () => {
    const { conn, client } = connected()
    client.open()
    client.emit("client:kicked", { code: 4003, reason: CloseReason.FULL })
    client.close()
    expect(conn.status.value.type).toBe(ConnectionStatus.REJECTED)
    expect(rejectionOf(conn)?.title).toBe("That game is full")
  })

  it("stays rejected if a retry follows the rejection", () => {
    const { conn, client } = connected()
    client.open()
    client.emit("client:kicked", { code: 4003, reason: CloseReason.FULL })
    client.close()
    client.emit("client:reconnecting")
    expect(conn.status.value.type).toBe(ConnectionStatus.REJECTED)
    expect(rejectionOf(conn)?.title).toBe("That game is full")
  })

  it("is rejected when it gives up reconnecting, keeping an earlier reason", () => {
    const { conn, client } = connected()
    client.emit("client:reconnect_failed")
    expect(conn.status.value.type).toBe(ConnectionStatus.REJECTED)
    expect(rejectionOf(conn)?.title).toBe("Lost the connection")

    const other = connected()
    other.client.emit("client:kicked", { code: 4003, reason: CloseReason.REMOVED })
    other.client.emit("client:reconnect_failed")
    expect(rejectionOf(other.conn)?.action).toBe(RejectionAction.FORGET_SEAT)
  })

  it("is idle after disconnecting, unless it was rejected", () => {
    const { conn, client } = connected()
    client.open()
    conn.disconnect()
    expect(conn.status.value.type).toBe(ConnectionStatus.IDLE)

    const other = connected()
    other.client.emit("client:kicked", { code: 4003, reason: CloseReason.FINISHED })
    other.conn.disconnect()
    expect(other.conn.status.value.type).toBe(ConnectionStatus.REJECTED)
  })

  it("comes back to the same game, never hosting another", async () => {
    const { client } = connected()
    expect(await client.nextTicket()).toMatchObject({ entry: { type: GameEntryType.HOST } })
    expect(await client.nextTicket()).not.toHaveProperty("entry.code")
    client.open()
    client.state(makeLobbyView({ code: roomCode("WXYZ") }))
    expect(await client.nextTicket()).toMatchObject({
      entry: { type: GameEntryType.JOIN, code: "WXYZ" },
      name: "Alice"
    })
  })

  it("tries again a moment after the server sheds it for sending too much, rejoining its game", async () => {
    vi.useFakeTimers()
    const { conn, client, clients } = connected()
    client.open()
    client.state(makeLobbyView({ code: roomCode("WXYZ") }))
    client.emit("client:kicked", { code: 4003, reason: "rate_limited" })
    expect(conn.status.value.type).not.toBe(ConnectionStatus.REJECTED)
    vi.advanceTimersByTime(1000)
    expect(clients).toHaveLength(2)
    expect(decodeTicket(clients[1]!.tickets[0]!)).toMatchObject({ entry: { type: GameEntryType.JOIN, code: "WXYZ" } })
  })

  it("leaves a connection refused for the network's rate to the client's own retries", () => {
    vi.useFakeTimers()
    const { conn, client, clients } = connected()
    client.emit("client:kicked", { code: 4005, reason: "rate_limited" })
    vi.advanceTimersByTime(5000)
    expect(clients).toHaveLength(1)
    expect(conn.status.value.type).toBe(ConnectionStatus.CONNECTING)
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
    client.state(makeGuessingView({ serverTime: 12_500 }))
    expect(conn.view.value?.phase).toBe(Phase.GUESSING)
    expect(conn.clockOffset.value).toBe(2500)
    expect(conn.lastError.value).toBeUndefined()
  })

  it("keeps the clock offset of the least delayed message, until a reconnect", () => {
    vi.useFakeTimers({ now: 10_000 })
    const { conn, client } = connected()
    client.open()
    client.state(makeLobbyView({ serverTime: 12_500 }))
    vi.setSystemTime(20_000)
    client.state(makeLobbyView({ serverTime: 21_500 }))
    expect(conn.clockOffset.value).toBe(2500)

    client.close()
    client.open()
    client.state(makeLobbyView({ serverTime: 21_500 }))
    expect(conn.clockOffset.value).toBe(1500)
  })

  it("hands back your paint while guessing, but not paint from before a reconnect", () => {
    const paint = { cells: { "85283473fffffff": 1 }, floor: 0.05 }
    const { conn, client } = connected()
    client.open()
    client.emit("paint", encodePaint(paint))
    client.state(makeGuessingView())
    expect(viewIn(conn.view.value, Phase.GUESSING).you.paint).toEqual(decodePaint(encodePaint(paint)))

    client.close()
    client.open()
    client.state(makeGuessingView())
    expect(viewIn(conn.view.value, Phase.GUESSING).you.paint).toBeUndefined()
  })

  it("waits for its reveal before showing a reveal's state", () => {
    const reveal: RoundReveal = {
      index: 2,
      total: 5,
      question: makeQuestionView(),
      answer: { lat: 35, lon: 135.8 },
      place: placeId("kyoto"),
      label: "Kyoto",
      wiki: wikiTitle("Kyoto"),
      results: []
    }
    const at = (index: number) => makeRevealView({ reveal: { ...reveal, index, ready: [] } })
    const { conn, client } = connected()
    client.open()
    client.emit("reveal", encoder.encode(JSON.stringify(revealMessage(reveal))))
    client.state(at(1))
    expect(conn.view.value).toBeUndefined()
    client.state(at(2))
    expect(viewIn(conn.view.value, Phase.REVEAL).reveal.label).toBe("Kyoto")
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

describe("Connection liveness", () => {
  afterEach(() => vi.useRealTimers())

  function inGame() {
    vi.useFakeTimers()
    const game = connected()
    game.client.open()
    game.client.state(makeLobbyView({ code: roomCode("WXYZ") }))
    return game
  }
  const pings = (client: FakeClient) => client.sent.filter((t) => t === "ping").length

  it("pings now and then, and carries on while the server answers", () => {
    const { conn, client, clients } = inGame()
    vi.advanceTimersByTime(PING_EVERY)
    expect(pings(client)).toBe(1)
    client.emit("pong")
    vi.advanceTimersByTime(PING_EVERY)
    expect(pings(client)).toBe(2)
    expect(clients).toHaveLength(1)
    expect(conn.status.value.type).toBe(ConnectionStatus.CONNECTED)
  })

  it("takes a ping with no answer for a dead connection, and reconnects to its game", () => {
    const { conn, client, clients } = inGame()
    vi.advanceTimersByTime(PING_EVERY + PONG_WITHIN)
    expect(client.connected).toBe(false)
    expect(clients).toHaveLength(2)
    expect(conn.status.value.type).toBe(ConnectionStatus.CONNECTING)
    expect(decodeTicket(clients[1]!.tickets[0]!)).toMatchObject({ entry: { type: GameEntryType.JOIN, code: "WXYZ" } })
  })

  it("pings at once when the page or the network comes back", () => {
    const { client } = inGame()
    document.dispatchEvent(new Event("visibilitychange"))
    expect(pings(client)).toBe(1)
    client.emit("pong")
    window.dispatchEvent(new Event("online"))
    expect(pings(client)).toBe(2)
  })

  it("waits for an answer before pinging again", () => {
    const { client } = inGame()
    window.dispatchEvent(new Event("online"))
    window.dispatchEvent(new Event("online"))
    expect(pings(client)).toBe(1)
  })

  it("stops when the connection drops", () => {
    const { client, clients } = inGame()
    client.close()
    vi.advanceTimersByTime(PING_EVERY + PONG_WITHIN)
    window.dispatchEvent(new Event("online"))
    expect(pings(client)).toBe(0)
    expect(clients).toHaveLength(1)
  })

  it("stops when disconnected", () => {
    const { conn, client } = inGame()
    conn.disconnect()
    vi.advanceTimersByTime(PING_EVERY + PONG_WITHIN)
    window.dispatchEvent(new Event("online"))
    expect(pings(client)).toBe(0)
  })
})
