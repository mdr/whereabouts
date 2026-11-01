/**
 * Connection to the game server. Wraps the Rivalis browser client and exposes
 * the latest GameView and connection status as signals.
 */
import { WSClient, type ClientKickedEvent, type WSClientOptions } from "@rivalis/browser"
import { computed, signal } from "@preact/signals"
import { type ClientSend, type ClientTopic } from "@whereabouts/shared/protocol/client-messages"
import { type ConfigurePatch, MAX_PLAYERS, MAX_SPECTATORS } from "@whereabouts/shared/protocol/config"
import { GameEntryType, PROTOCOL_VERSION, encodeTicket, type Ticket } from "@whereabouts/shared/protocol/ticket"
import {
  revealFrom,
  type RevealMessage,
  type StateMessage,
  viewFrom
} from "@whereabouts/shared/protocol/server-messages"
import { type GameView, type PaintSubmission, type RoundReveal, Phase } from "@whereabouts/shared/protocol/views"
import { Role } from "@whereabouts/shared/roles"
import { decodePaint, encodePaint } from "@whereabouts/shared/paint/paint-wire"
import { CloseReason, isCloseReason } from "@whereabouts/shared/close-reason"
import type { HintAxis } from "@whereabouts/shared/hints"
import type { PlayerId, PlayerName } from "@whereabouts/shared/ids"
import { reloadForNewBuild } from "./stale-build"
import { startHeartbeat, type Heartbeat } from "./heartbeat"
import type { Instant, Ms } from "@whereabouts/shared/units"

export enum ConnectionStatus {
  IDLE = "IDLE",
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  DISCONNECTED = "DISCONNECTED",
  REJECTED = "REJECTED"
}

export interface PlainState {
  type: Exclude<ConnectionStatus, ConnectionStatus.REJECTED>
}

/** Turned away or closed out; `rejection` says why, in words for the player. */
interface RejectedState {
  type: ConnectionStatus.REJECTED
  rejection: Rejection
}

export type ConnectionState = PlainState | RejectedState

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${location.host}/ws`
}

type Topic = "state" | "reveal" | "paint" | "error" | "pong"

/**
 * Tries at getting into a game before giving up (about 90 s). Once in one,
 * it keeps trying: the seat is held, and the server refuses once the game
 * has gone.
 */
const JOIN_ATTEMPTS = 20

/** What a Connection needs of the Rivalis client, so tests can drive a fake. */
export interface GameClient {
  readonly connected: boolean
  connect(ticket: string): void
  disconnect(): void
  send(topic: string, payload: Uint8Array | string): void
  on(
    event: "client:connect" | "client:disconnect" | "client:reconnect_failed" | "client:error",
    listener: () => void
  ): unknown
  on(event: "client:reconnecting", listener: (attempt: Uint8Array) => void): unknown
  on(event: "client:kicked", listener: (info: ClientKickedEvent) => void): unknown
  on(event: Topic, listener: (payload: Uint8Array) => void): unknown
}

export type ClientFactory = (url: string, options: WSClientOptions) => GameClient

const wsClient: ClientFactory = (url, options) => new WSClient<Topic>(url, options)

export class Connection {
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
    client.on("client:connect", () => {
      // The server sends again whatever a fresh connection needs.
      this.reveal = undefined
      this.paint = undefined
      this.offsetMeasured = false
      this.status.value = { type: ConnectionStatus.CONNECTED }
      this.stopHeartbeat()
      this.heartbeat = startHeartbeat(
        () => client.send("ping", ""),
        () => {
          if (this.client === client) this.connect(again())
        }
      )
    })
    client.on("client:disconnect", () => {
      this.stopHeartbeat()
      if (!this.rejected()) this.status.value = { type: ConnectionStatus.DISCONNECTED }
    })
    client.on("client:reconnecting", (attempt) => {
      if (this.view.value || this.rejected()) return
      if (Number(this.decoder.decode(attempt)) > JOIN_ATTEMPTS) {
        client.disconnect()
        this.reject(describeDisconnect(0, "reconnect_failed"))
        return
      }
      // Still trying to get in for the first time: not yet a failure.
      this.status.value = { type: ConnectionStatus.CONNECTING }
    })
    client.on("client:kicked", ({ code, reason }) => {
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
    client.on("client:reconnect_failed", () => {
      if (!this.rejected()) this.reject(describeDisconnect(0, "reconnect_failed"))
    })
    client.on("client:error", () => {
      /* surfaced via disconnect */
    })
    client.on("reveal", (payload) => {
      this.reveal = revealFrom(JSON.parse(this.decoder.decode(payload)) as RevealMessage)
    })
    client.on("paint", (payload) => {
      this.paint = decodePaint(payload)
    })
    client.on("state", (payload) => {
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
    client.on("pong", () => this.heartbeat?.pong())
    client.on("error", (payload) => {
      const { message } = JSON.parse(this.decoder.decode(payload)) as { message: string }
      this.lastError.value = message
    })
    this.client = client
    client.connect(encodeTicket({ v: PROTOCOL_VERSION, ...ticket }))
  }

  /** Try again after giving up: back into the game it was in, if any. */
  rejoin(): void {
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

  private send<K extends ClientTopic>(...[topic, body]: ClientSend<K>): void {
    if (!this.client?.connected) return
    this.client.send(topic, JSON.stringify(body ?? {}))
  }

  sendPaint(paint: PaintSubmission): void {
    if (this.client?.connected) this.client.send("paint", encodePaint(paint))
  }
  lock(): void {
    this.send("lock")
  }
  unlock(): void {
    this.send("unlock")
  }
  ready(): void {
    this.send("ready")
  }
  configure(patch: ConfigurePatch): void {
    this.send("configure", patch)
  }
  start(): void {
    this.send("start")
  }
  next(): void {
    this.send("next")
  }
  again(): void {
    this.send("again")
  }
  rename(name: PlayerName): void {
    this.send("rename", { name })
  }
  hint(axis: HintAxis): void {
    this.send("hint", { axis })
  }
  kick(playerId: PlayerId): void {
    this.send("kick", { playerId })
  }
  /** Give up this seat for good (the lobby's Leave); disconnect afterwards. */
  leave(): void {
    this.send("leave")
  }
  /** In the lobby: watch instead of play, or take a free seat. */
  setRole(role: Role): void {
    this.send("setRole", { role })
  }
  makeHost(playerId: PlayerId): void {
    this.send("makeHost", { playerId })
  }
  end(): void {
    this.send("end")
  }

  /** Local-clock ms until a server deadline. */
  timeUntil(at: Instant): Ms {
    return at - (Date.now() + this.clockOffset.value)
  }
}

/** What the page offers after a rejection. */
export enum RejectionAction {
  /** The server could not be reached, so trying again may work. */
  RETRY = "RETRY",
  /** No game has the code, so the player may host one under it. */
  HOST_UNDER_CODE = "HOST_UNDER_CODE",
  /** The host removed this player; the client forgets its seat token. */
  FORGET_SEAT = "FORGET_SEAT",
  NONE = "NONE"
}

export interface Rejection {
  title: string
  detail: string
  action: RejectionAction
}

/**
 * Turn a WebSocket close code and its reason into something a player can
 * act on. Reasons are our CloseReason codes, or Rivalis's own for the room
 * closing and for giving up on reconnecting.
 */
export function describeDisconnect(code: number, reason: string | undefined): Rejection {
  const reasonText = reason ?? ""
  if (reasonText === "room_destroyed") {
    return {
      title: "That game has ended",
      detail: "Everyone left, so the room was closed. Game codes only live while someone is in the game.",
      action: RejectionAction.NONE
    }
  }
  if (reasonText === "reconnect_failed") {
    return {
      title: "Lost the connection",
      detail: "We could not reach the game server. Check your network and try again.",
      action: RejectionAction.RETRY
    }
  }
  if (!isCloseReason(reasonText))
    return {
      title: "Disconnected",
      detail: reasonText || `The connection closed (code ${code}).`,
      action: RejectionAction.NONE
    }
  switch (reasonText) {
    case CloseReason.NO_SUCH_GAME:
      return {
        title: "No game with that code",
        detail:
          "Check the code with your host. If the game finished or everyone left, you can host a new one under the same code.",
        action: RejectionAction.HOST_UNDER_CODE
      }
    case CloseReason.OUTDATED:
      return { title: "A new version is out", detail: "Reload the page to carry on.", action: RejectionAction.NONE }
    case CloseReason.UNAVAILABLE:
      return {
        title: "Couldn't start a game",
        detail: "The server had no free game code. Try again in a moment.",
        action: RejectionAction.NONE
      }
    case CloseReason.REMOVED:
      return {
        title: "You were removed from the game",
        detail: "The host took you out of this game. You can rejoin with the code as a new player, or start your own.",
        action: RejectionAction.FORGET_SEAT
      }
    case CloseReason.FINISHED:
      return {
        title: "That game has finished",
        detail: "The final results are in. Ask the host to start a new game.",
        action: RejectionAction.NONE
      }
    case CloseReason.FULL:
      return {
        title: "That game is full",
        detail: `It already has ${MAX_PLAYERS} players and ${MAX_SPECTATORS} people watching, the most a game can hold. Ask the host to remove someone, or start your own game.`,
        action: RejectionAction.NONE
      }
    case CloseReason.NO_ROOM_TO_WATCH:
      return {
        title: "No room to watch",
        detail: `${MAX_SPECTATORS} people are already watching that game, the most it allows. You can still join it as a player.`,
        action: RejectionAction.NONE
      }
    case CloseReason.REPLACED:
      return {
        title: "You joined from another tab",
        detail: "This game is now open in your newer tab, so this one has been signed out.",
        action: RejectionAction.NONE
      }
    case CloseReason.LEFT:
      return {
        title: "You left the game",
        detail: "Rejoin with the code, or start your own game.",
        action: RejectionAction.NONE
      }
    case CloseReason.SERVER_RESTARTED:
      return {
        title: "The server restarted for an update",
        detail: "That game has ended. The host can start a new one.",
        action: RejectionAction.NONE
      }
  }
}
