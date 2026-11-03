/**
 * One connection's protocol level: the messages as they go over the socket and
 * the states as the client puts them together. Node 22 provides global
 * WebSocket, TextEncoder and URL; the client reads them from `window`, so the
 * test aliases window to globalThis.
 */
import type { WSClient as WSClientType } from "@rivalis/browser"
import { type ClientSend, ClientTopic, type JsonTopic } from "@whereabouts/shared/protocol/client-messages"
import { encodePaint, decodePaint } from "@whereabouts/shared/paint/paint-wire"
import { SocketEvent } from "@whereabouts/shared/protocol/socket-event"
import {
  revealFrom,
  viewFrom,
  type RevealMessage,
  ServerTopic,
  type StateMessage
} from "@whereabouts/shared/protocol/server-messages"
import { PROTOCOL_VERSION, encodeTicket, type GameEntry } from "@whereabouts/shared/protocol/ticket"
import { GameViewSchema } from "@whereabouts/shared/protocol/view-schema"
import { type GameView, type PaintSubmission, type RoundReveal, Phase } from "@whereabouts/shared/protocol/views"
import type { PlayerName, PlayerToken } from "@whereabouts/shared/ids"
import { eventually } from "./eventually.ts"

// Static imports hoist above this line, so the client is loaded dynamically.
;(globalThis as unknown as { window: unknown }).window = globalThis
const { WSClient } = await import("@rivalis/browser")

export class Wire {
  readonly client: WSClientType<ServerTopic>
  /** Views as the client puts them together from state, reveal and paint messages. */
  readonly states: GameView[] = []
  readonly rawStates: string[] = []
  readonly reveals: RoundReveal[] = []
  readonly errors: string[] = []
  /** Why each state message that did not match GameViewSchema failed. */
  readonly invalidStates: string[] = []
  /** The reason the server gave for closing the connection, if it did. */
  closedFor: string | undefined = undefined
  private readonly token: PlayerToken
  private readonly name: PlayerName
  private tried = false

  constructor(url: string, name: PlayerName, token: PlayerToken) {
    this.name = name
    this.token = token
    this.client = new WSClient<ServerTopic>(url, { ticketSource: "protocol", reconnect: false })
    const decoder = new TextDecoder()
    let reveal: RoundReveal | undefined = undefined
    let paint: PaintSubmission | undefined = undefined
    this.client.on(ServerTopic.REVEAL, (payload) => {
      reveal = revealFrom(JSON.parse(decoder.decode(payload)) as RevealMessage)
      this.reveals.push(reveal)
    })
    this.client.on(ServerTopic.PAINT, (payload) => {
      paint = decodePaint(payload)
    })
    this.client.on(ServerTopic.STATE, (payload) => {
      const raw = decoder.decode(payload)
      const state = JSON.parse(raw) as StateMessage
      if (state.phase !== Phase.REVEAL) reveal = undefined
      if (state.phase !== Phase.GUESSING) paint = undefined
      const view = viewFrom(state, reveal, paint)
      this.rawStates.push(raw)
      if (!view) {
        this.invalidStates.push("a reveal state came before its reveal")
        return
      }
      const checked = GameViewSchema.safeParse(view)
      if (!checked.success) this.invalidStates.push(checked.error.message)
      this.states.push(view)
    })
    this.client.on(SocketEvent.KICKED, ({ reason }) => (this.closedFor = reason))
    this.client.on(ServerTopic.ERROR, (payload) =>
      this.errors.push((JSON.parse(decoder.decode(payload)) as { message: string }).message)
    )
  }

  /** Whether a connection was tried on this wire: a later one needs a fresh wire. */
  get used(): boolean {
    return this.tried
  }

  get closed(): boolean {
    return this.tried && !this.client.connected
  }

  get latest(): GameView | undefined {
    return this.states.at(-1)
  }

  connect(entry: GameEntry): void {
    this.connectWith(encodeTicket({ v: PROTOCOL_VERSION, token: this.token, name: this.name, entry }))
  }

  /** Connect with a ticket exactly as given. */
  connectWith(ticket: string): void {
    this.tried = true
    this.client.connect(ticket)
  }

  send<K extends JsonTopic>(...[topic, body]: ClientSend<K>): void {
    this.client.send(topic, JSON.stringify(body ?? {}))
  }

  sendPaint(paint: PaintSubmission): void {
    this.client.send(ClientTopic.PAINT, encodePaint(paint))
  }

  /** Any topic, with a payload as given. */
  sendRaw(topic: string, payload: string | Uint8Array): void {
    this.client.send(topic, payload)
  }

  /** Wait for an error with this message, then forget the errors so far. */
  async expectError(message: string): Promise<void> {
    await eventually(
      () => this.errors.includes(message),
      () => `the error "${message}"; got ${JSON.stringify(this.errors)}`,
      2000
    )
    this.errors.length = 0
  }

  async expectPong(): Promise<void> {
    let pongs = 0
    this.client.on(ServerTopic.PONG, () => pongs++)
    this.client.send(ClientTopic.PING, "")
    await eventually(
      () => pongs === 1,
      () => "a pong"
    )
  }
}
