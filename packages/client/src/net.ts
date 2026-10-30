/**
 * Connection to the game server. Wraps the Rivalis browser client and exposes
 * the latest GameView and connection status as signals.
 */
import { WSClient } from "@rivalis/browser"
import { computed, signal } from "@preact/signals"
import {
  type ConfigurePatch,
  MAX_PLAYERS,
  MAX_SPECTATORS,
  PROTOCOL_VERSION,
  encodeTicket,
  revealFrom,
  type GameView,
  type PaintSubmission,
  type RevealMessage,
  type RoundReveal,
  type StateMessage,
  type Ticket,
  viewFrom
} from "@whereabouts/shared/protocol"
import { decodePaint, encodePaint } from "@whereabouts/shared/paint-wire"
import { isCloseReason } from "@whereabouts/shared/close-reason"
import type { HintAxis } from "@whereabouts/shared/hints"
import type { PlayerName } from "@whereabouts/shared/ids"
import { reloadForNewBuild } from "./stale-build"

export type Status = "idle" | "connecting" | "connected" | "disconnected" | "rejected"

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${location.host}/ws`
}

export class Connection {
  readonly view = signal<GameView | undefined>(undefined)
  readonly status = signal<Status>("idle")
  readonly lastError = signal<string | undefined>(undefined)
  /** serverTime - Date.now(), so deadlines can be shown on the local clock. */
  readonly clockOffset = signal(0)
  /** Why the server turned us away or closed the game, in words for the player. */
  readonly rejection = signal<Rejection | undefined>(undefined)
  readonly code = computed(() => this.view.value?.code)

  private client: WSClient<"state" | "reveal" | "paint" | "error"> | undefined = undefined
  private decoder = new TextDecoder()
  /** What the server has sent since this connection opened, for the state messages that follow. */
  private reveal: RoundReveal | undefined = undefined
  private paint: PaintSubmission | undefined = undefined

  connect(ticket: Omit<Ticket, "v">): void {
    this.disconnect()
    this.status.value = "connecting"
    this.lastError.value = undefined
    this.rejection.value = undefined
    // Once in a game, coming back means joining it, not hosting another.
    const again = () => (this.code.value === undefined ? ticket : { ...ticket, create: false, code: this.code.value })
    const client = new WSClient<"state" | "reveal" | "paint" | "error">(wsUrl(), {
      ticketSource: "protocol",
      reconnect: { baseDelayMs: 500, maxDelayMs: 5000, maxAttempts: 20 },
      getTicket: () => encodeTicket({ v: PROTOCOL_VERSION, ...again() })
    })
    client.on("client:connect", () => {
      // The server sends again whatever a fresh connection needs.
      this.reveal = undefined
      this.paint = undefined
      this.status.value = "connected"
    })
    client.on("client:disconnect", () => {
      if (this.status.value !== "rejected") this.status.value = "disconnected"
    })
    // Still trying to get in for the first time: not yet a failure.
    client.on("client:reconnecting", () => {
      if (!this.view.value) this.status.value = "connecting"
    })
    client.on("client:kicked", ({ code, reason }) => {
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
      if (reason === "outdated" && reloadForNewBuild()) return
      this.status.value = "rejected"
      this.rejection.value = describeDisconnect(code, reason)
    })
    client.on("client:reconnect_failed", () => {
      this.status.value = "rejected"
      this.rejection.value ??= describeDisconnect(0, "reconnect_failed")
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
      if (!state.reveal) this.reveal = undefined
      if (state.phase !== "guessing") this.paint = undefined
      const view = viewFrom(state, this.reveal, this.paint)
      this.clockOffset.value = view.serverTime - Date.now()
      this.view.value = view
      // A fresh state means the server is happy with us; stop showing an old complaint.
      this.lastError.value = undefined
    })
    client.on("error", (payload) => {
      const { message } = JSON.parse(this.decoder.decode(payload)) as { message: string }
      this.lastError.value = message
    })
    this.client = client
    client.connect(encodeTicket({ v: PROTOCOL_VERSION, ...ticket }))
  }

  disconnect(): void {
    this.client?.disconnect()
    this.client = undefined
    if (this.status.value !== "rejected") this.status.value = "idle"
  }

  private send(topic: string, body: unknown = {}): void {
    if (!this.client?.connected) return
    this.client.send(topic, JSON.stringify(body))
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
  kick(playerId: string): void {
    this.send("kick", { playerId })
  }
  /** Give up this seat for good (the lobby's Leave); disconnect afterwards. */
  leave(): void {
    this.send("leave")
  }
  /** In the lobby: watch instead of play, or take a free seat. */
  setRole(watch: boolean): void {
    this.send("setRole", { watch })
  }
  makeHost(playerId: string): void {
    this.send("makeHost", { playerId })
  }
  end(): void {
    this.send("end")
  }

  /** Local-clock ms until a server deadline. */
  msUntil(serverEpochMs: number): number {
    return serverEpochMs - (Date.now() + this.clockOffset.value)
  }
}

export interface Rejection {
  title: string
  detail: string
  /** Set when the host removed this player; the client then forgets its seat token. */
  removed?: boolean
  /** Set when no game has the code, so the player may host one under it. */
  missing?: boolean
}

/**
 * Turn a WebSocket close code and its reason into something a player can
 * act on. Reasons are our CloseReason codes, or Rivalis's own for the room
 * closing and for giving up on reconnecting.
 */
export function describeDisconnect(code: number, reason: string | undefined): Rejection {
  const r = reason ?? ""
  if (r === "room_destroyed") {
    return {
      title: "That game has ended",
      detail: "Everyone left, so the room was closed. Game codes only live while someone is in the game."
    }
  }
  if (r === "reconnect_failed") {
    return {
      title: "Lost the connection",
      detail: "We could not reach the game server again. Check your network and rejoin."
    }
  }
  if (!isCloseReason(r)) return { title: "Disconnected", detail: r || `The connection closed (code ${code}).` }
  switch (r) {
    case "noSuchGame":
      return {
        title: "No game with that code",
        detail:
          "Check the code with your host. If the game finished or everyone left, you can host a new one under the same code.",
        missing: true
      }
    case "outdated":
      return { title: "A new version is out", detail: "Reload the page to carry on." }
    case "unavailable":
      return { title: "Couldn't start a game", detail: "The server had no free game code. Try again in a moment." }
    case "removed":
      return {
        title: "You were removed from the game",
        detail: "The host took you out of this game. You can rejoin with the code as a new player, or start your own.",
        removed: true
      }
    case "finished":
      return { title: "That game has finished", detail: "The final results are in. Ask the host to start a new game." }
    case "full":
      return {
        title: "That game is full",
        detail: `It already has ${MAX_PLAYERS} players and ${MAX_SPECTATORS} people watching, the most a game can hold. Ask the host to remove someone, or start your own game.`
      }
    case "noRoomToWatch":
      return {
        title: "No room to watch",
        detail: `${MAX_SPECTATORS} people are already watching that game, the most it allows. You can still join it as a player.`
      }
    case "replaced":
      return {
        title: "You joined from another tab",
        detail: "This game is now open in your newer tab, so this one has been signed out."
      }
    case "left":
      return { title: "You left the game", detail: "Rejoin with the code, or start your own game." }
  }
}
