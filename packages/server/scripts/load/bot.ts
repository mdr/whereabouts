import type { WSClient as WSClientType } from "@rivalis/browser"
import { type ClientSend, ClientTopic, type JsonTopic } from "@whereabouts/shared/protocol/client-messages"
import { playerName, playerToken } from "@whereabouts/shared/ids"
import { PROTOCOL_VERSION, encodeTicket, type GameEntry } from "@whereabouts/shared/protocol/ticket"
import { ServerTopic, type StateMessage } from "@whereabouts/shared/protocol/server-messages"
import { SocketEvent } from "@whereabouts/shared/protocol/socket-event"

// The client reads WebSocket and friends from `window`; static imports hoist, so it loads dynamically.
;(globalThis as unknown as { window: unknown }).window = globalThis
const { WSClient } = await import("@rivalis/browser")

export interface Arrival {
  at: number
  bytes: number
}

export interface PingSample {
  sentAt: number
  roundTripMs: number
}

const PING_INTERVAL_MS = 500

/**
 * A scripted game client. Reveals are timed and measured but not parsed, so
 * the load test's own CPU distorts the server's numbers as little as it can.
 */
export class Bot {
  private readonly client: WSClientType<ServerTopic>
  private readonly decoder = new TextDecoder()
  private pingSentAt: number | undefined = undefined
  private pinger: NodeJS.Timeout | undefined = undefined
  private open = false
  state: StateMessage | undefined = undefined
  readonly reveals: Arrival[] = []
  readonly pings: PingSample[] = []
  readonly errors: string[] = []
  closedFor: string | undefined = undefined

  constructor(
    url: string,
    readonly name: string
  ) {
    this.client = new WSClient<ServerTopic>(url, { ticketSource: "protocol", reconnect: false })
    this.client.on(ServerTopic.STATE, (payload) => {
      this.state = JSON.parse(this.decoder.decode(payload)) as StateMessage
    })
    this.client.on(ServerTopic.REVEAL, (payload) => this.reveals.push({ at: Date.now(), bytes: payload.byteLength }))
    this.client.on(ServerTopic.PONG, () => {
      if (this.pingSentAt === undefined) return
      this.pings.push({ sentAt: this.pingSentAt, roundTripMs: Date.now() - this.pingSentAt })
      this.pingSentAt = undefined
    })
    this.client.on(ServerTopic.ERROR, (payload) =>
      this.errors.push((JSON.parse(this.decoder.decode(payload)) as { message: string }).message)
    )
    this.client.on(SocketEvent.KICKED, ({ reason }) => (this.closedFor = reason))
    this.client.on(SocketEvent.CONNECT, () => (this.open = true))
    this.client.on(SocketEvent.DISCONNECT, () => {
      this.open = false
      // The server terminates a connection whose send buffer is over its limit, with no reason given.
      this.closedFor ??= "connection dropped"
    })
  }

  connect(entry: GameEntry) {
    const token = playerToken(`${this.name}-load-token-0123456789abcdef`)
    this.client.connect(encodeTicket({ v: PROTOCOL_VERSION, token, name: playerName(this.name), entry }))
    // A ping still unanswered is skipped rather than overlapped, so a stall shows as one long round trip.
    this.pinger = setInterval(() => {
      if (this.pingSentAt !== undefined || !this.open) return
      this.pingSentAt = Date.now()
      this.client.send(ClientTopic.PING, "")
    }, PING_INTERVAL_MS)
  }

  send<K extends JsonTopic>(...[topic, body]: ClientSend<K>) {
    this.client.send(topic, JSON.stringify(body ?? {}))
  }

  sendPaint(bytes: Uint8Array) {
    this.client.send(ClientTopic.PAINT, bytes)
  }

  async until(done: (state: StateMessage) => boolean, what: string, ms = 30_000): Promise<StateMessage> {
    const start = Date.now()
    while (Date.now() - start < ms) {
      if (this.closedFor !== undefined) throw new Error(`${this.name} was closed: ${this.closedFor}`)
      if (this.state && done(this.state)) return this.state
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    throw new Error(`${this.name}: gave up after ${ms} ms waiting for ${what}`)
  }

  disconnect() {
    clearInterval(this.pinger)
    this.client.disconnect()
  }
}
