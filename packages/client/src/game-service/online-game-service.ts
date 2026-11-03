/**
 * The online game, over a connection to the game server. Wraps the Rivalis browser client and exposes
 * the latest GameView and connection status as signals.
 */
import { WSClient, type ClientKickedEvent, type WSClientOptions } from "@rivalis/browser"
import { computed, signal } from "@preact/signals"
import { type ClientSend, ClientTopic, type JsonTopic } from "@whereabouts/shared/protocol/client-messages"
import { SocketEvent } from "@whereabouts/shared/protocol/socket-event"
import { type ConfigurePatch } from "@whereabouts/shared/protocol/config"
import { GameEntryType, PROTOCOL_VERSION, encodeTicket, type Ticket } from "@whereabouts/shared/protocol/ticket"
import {
  revealFrom,
  type RevealMessage,
  ServerTopic,
  type StateMessage,
  viewFrom
} from "@whereabouts/shared/protocol/server-messages"
import { type GameView, type PaintSubmission, type RoundReveal, Phase } from "@whereabouts/shared/protocol/views"
import { Role } from "@whereabouts/shared/roles"
import { decodePaint, encodePaint } from "@whereabouts/shared/paint/paint-wire"
import { CloseReason, isCloseReason } from "@whereabouts/shared/close-reason"
import type { HintAxis } from "@whereabouts/shared/hints"
import type { PlayerId, PlayerName } from "@whereabouts/shared/ids"
import { describeDisconnect, type Rejection } from "../net/rejection"
import { reloadForNewBuild } from "../net/stale-build"
import { startHeartbeat, type Heartbeat } from "../net/heartbeat"
import type { Instant, Ms } from "@whereabouts/shared/units"
import type { GameService } from "./game-service"
import { ConnectionStatus, type ConnectionState } from "./connection-state"

const wsUrl = (): string => {
  const proto = location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${location.host}/ws`
}

/**
 * Tries at getting into a game before giving up (about 90 s). Once in one,
 * it keeps trying: the seat is held, and the server refuses once the game
 * has gone.
 */
const JOIN_ATTEMPTS = 20

/** What an OnlineGameService needs of the Rivalis client, so tests can drive a fake. */
export interface GameClient {
  readonly connected: boolean
  connect(ticket: string): void
  disconnect(): void
  send(topic: ClientTopic, payload: Uint8Array | string): void
  on(
    event:
      | typeof SocketEvent.CONNECT
      | typeof SocketEvent.DISCONNECT
      | typeof SocketEvent.RECONNECT_FAILED
      | typeof SocketEvent.ERROR,
    listener: () => void
  ): unknown
  on(event: typeof SocketEvent.RECONNECTING, listener: (attempt: Uint8Array) => void): unknown
  on(event: typeof SocketEvent.KICKED, listener: (info: ClientKickedEvent) => void): unknown
  on(event: ServerTopic, listener: (payload: Uint8Array) => void): unknown
}

export type ClientFactory = (url: string, options: WSClientOptions) => GameClient

const wsClient: ClientFactory = (url, options) => new WSClient<ServerTopic>(url, options)

export class OnlineGameService implements GameService {
  readonly view = signal<GameView | undefined>(undefined)
  readonly status = signal<ConnectionState>({ type: ConnectionStatus.IDLE })
  readonly lastError = signal<string | undefined>(undefined)
  /**
   * serverTime - Date.now(), so deadlines can be shown on the local clock. A
   * message handled late reads low, never high, so this is the largest seen
   * since the connection opened.
   */
  readonly clockOffset = signal<Ms>(0)
  readonly code = computed(() => this.view.value?.code)
  /** Whether a command sent now reaches the server: only paint and Done are resent after a drop. */
  readonly online = computed(() => this.status.value.type === ConnectionStatus.CONNECTED)

  private client: GameClient | undefined = undefined
  /** The ticket to come back with: the game's code once in one. */
  private comeBack: (() => Omit<Ticket, "v">) | undefined = undefined
  private decoder = new TextDecoder()
  /** What the server has sent since this connection opened, for the state messages that follow. */
  private reveal: RoundReveal | undefined = undefined
  private paint: PaintSubmission | undefined = undefined
  private offsetMeasured = false
  private heartbeat: Heartbeat | undefined = undefined

  private readonly makeClient: ClientFactory

  constructor(makeClient: ClientFactory = wsClient) {
    this.makeClient = makeClient
  }

  connect(ticket: Omit<Ticket, "v">): void {
    this.disconnect()
    this.status.value = { type: ConnectionStatus.CONNECTING }
    this.lastError.value = undefined
    // Once in a game, coming back means joining it, not hosting another.
    const again = (): Omit<Ticket, "v"> => {
      const code = this.code.value
      if (code === undefined) return ticket
      const role = ticket.entry.type === GameEntryType.JOIN ? ticket.entry.role : Role.PLAYER
      return { ...ticket, entry: { type: GameEntryType.JOIN, code, role } }
    }
    this.comeBack = again
    const client = this.makeClient(wsUrl(), {
      ticketSource: "protocol",
      reconnect: { baseDelayMs: 500, maxDelayMs: 5000, maxAttempts: Infinity },
      getTicket: () => encodeTicket({ v: PROTOCOL_VERSION, ...again() })
    })
    client.on(SocketEvent.CONNECT, () => {
      // The server sends again whatever a fresh connection needs.
      this.reveal = undefined
      this.paint = undefined
      this.offsetMeasured = false
      this.status.value = { type: ConnectionStatus.CONNECTED }
      this.stopHeartbeat()
      this.heartbeat = startHeartbeat(
        () => client.send(ClientTopic.PING, ""),
        () => {
          if (this.client === client) this.connect(again())
        }
      )
    })
    client.on(SocketEvent.DISCONNECT, () => {
      this.stopHeartbeat()
      if (!this.rejected()) this.status.value = { type: ConnectionStatus.DISCONNECTED }
    })
    client.on(SocketEvent.RECONNECTING, (attempt) => {
      if (this.view.value || this.rejected()) return
      if (Number(this.decoder.decode(attempt)) > JOIN_ATTEMPTS) {
        client.disconnect()
        this.reject(describeDisconnect(0, "reconnect_failed"))
        return
      }
      // Still trying to get in for the first time: not yet a failure.
      this.status.value = { type: ConnectionStatus.CONNECTING }
    })
    client.on(SocketEvent.KICKED, ({ code, reason }) => {
      this.stopHeartbeat()
      // Rivalis's KickReason.RATE_LIMITED: too many connections from this
      // network (refused before it got in, code 4005, which the client
      // retries by itself), or over the message limit, which Rivalis closes
      // like a removal, so the client would never come back.
      if (reason === "rate_limited") {
        if (code !== 4005)
          setTimeout(() => {
            if (this.client === client) this.connect(again())
          }, 1000)
        return
      }
      if (isCloseReason(reason) && reason === CloseReason.OUTDATED && reloadForNewBuild()) return
      this.reject(describeDisconnect(code, reason))
    })
    client.on(SocketEvent.RECONNECT_FAILED, () => {
      if (!this.rejected()) this.reject(describeDisconnect(0, "reconnect_failed"))
    })
    client.on(SocketEvent.ERROR, () => {
      /* surfaced via disconnect */
    })
    // Not parsed: checking every player's paint costs a slow phone 100 ms or more, and the ticket already matches protocol versions.
    client.on(ServerTopic.REVEAL, (payload) => {
      this.reveal = revealFrom(JSON.parse(this.decoder.decode(payload)) as RevealMessage)
    })
    client.on(ServerTopic.PAINT, (payload) => {
      this.paint = decodePaint(payload)
    })
    client.on(ServerTopic.STATE, (payload) => {
      const state = JSON.parse(this.decoder.decode(payload)) as StateMessage
      if (state.phase !== Phase.REVEAL) this.reveal = undefined
      if (state.phase !== Phase.GUESSING) this.paint = undefined
      const view = viewFrom(state, this.reveal, this.paint)
      if (!view) return
      const offset = view.serverTime - Date.now()
      if (!this.offsetMeasured || offset > this.clockOffset.value) this.clockOffset.value = offset
      this.offsetMeasured = true
      this.view.value = view
      // A fresh state means the server is happy with us; stop showing an old complaint.
      this.lastError.value = undefined
    })
    client.on(ServerTopic.PONG, () => this.heartbeat?.pong())
    client.on(ServerTopic.ERROR, (payload) => {
      const { message } = JSON.parse(this.decoder.decode(payload)) as { message: string }
      this.lastError.value = message
    })
    this.client = client
    client.connect(encodeTicket({ v: PROTOCOL_VERSION, ...ticket }))
  }

  /** Try again after giving up: back into the game it was in, if any. */
  rejoin = (): void => {
    if (this.comeBack) this.connect(this.comeBack())
  }

  disconnect(): void {
    this.stopHeartbeat()
    this.client?.disconnect()
    this.client = undefined
    if (!this.rejected()) this.status.value = { type: ConnectionStatus.IDLE }
  }

  private rejected(): boolean {
    return this.status.value.type === ConnectionStatus.REJECTED
  }

  private reject(rejection: Rejection): void {
    this.status.value = { type: ConnectionStatus.REJECTED, rejection }
  }

  private stopHeartbeat(): void {
    this.heartbeat?.stop()
    this.heartbeat = undefined
  }

  private send<K extends JsonTopic>(...[topic, body]: ClientSend<K>): void {
    if (!this.client?.connected) return
    this.client.send(topic, JSON.stringify(body ?? {}))
  }

  sendPaint = (paint: PaintSubmission): void => {
    if (this.client?.connected) this.client.send(ClientTopic.PAINT, encodePaint(paint))
  }
  lock = (): void => {
    this.send(ClientTopic.LOCK)
  }
  unlock = (): void => {
    this.send(ClientTopic.UNLOCK)
  }
  ready = (): void => {
    this.send(ClientTopic.READY)
  }
  configure = (patch: ConfigurePatch): void => {
    this.send(ClientTopic.CONFIGURE, patch)
  }
  start = (): void => {
    this.send(ClientTopic.START)
  }
  next = (): void => {
    this.send(ClientTopic.NEXT)
  }
  again = (): void => {
    this.send(ClientTopic.AGAIN)
  }
  rename = (name: PlayerName): void => {
    this.send(ClientTopic.RENAME, { name })
  }
  hint = (axis: HintAxis): void => {
    this.send(ClientTopic.HINT, { axis })
  }
  kick = (playerId: PlayerId): void => {
    this.send(ClientTopic.KICK, { playerId })
  }
  /** Give up this seat for good (the lobby's Leave); disconnect afterwards. */
  leave = (): void => {
    this.send(ClientTopic.LEAVE)
  }
  /** In the lobby: watch instead of play, or take a free seat. */
  setRole = (role: Role): void => {
    this.send(ClientTopic.SET_ROLE, { role })
  }
  makeHost = (playerId: PlayerId): void => {
    this.send(ClientTopic.MAKE_HOST, { playerId })
  }
  end = (): void => {
    this.send(ClientTopic.END)
  }

  /** Local-clock ms until a server deadline. */
  timeUntil = (at: Instant): Ms => at - (Date.now() + this.clockOffset.value)
}
