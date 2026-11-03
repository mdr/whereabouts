/**
 * A connection made below what a real client does, for what a browser cannot
 * be told to do: send a header, stop answering pings, stop reading. Players
 * meet the server through TestPlayer; this is for the transport's edges.
 */
import type { Socket } from "node:net"
import { WebSocket } from "ws"
import { encodeTicket, PROTOCOL_VERSION, type GameEntry } from "@whereabouts/shared/protocol/ticket"
import type { PlayerName, PlayerToken } from "@whereabouts/shared/ids"
import { eventually } from "./eventually.ts"

export interface RawSocketOptions {
  /** Sent as Fly-Client-IP, as Fly's proxy does. */
  address?: string
  origin?: string
}

export class RawSocket {
  private readonly socket: WebSocket
  private received = 0
  private answering = true
  private done = false

  constructor(
    url: string,
    identity: { name: PlayerName; token: PlayerToken },
    entry: GameEntry,
    { address, origin }: RawSocketOptions = {}
  ) {
    const ticket = encodeTicket({ v: PROTOCOL_VERSION, token: identity.token, name: identity.name, entry })
    this.socket = new WebSocket(url, ticket, {
      autoPong: false,
      ...(origin === undefined ? {} : { origin }),
      ...(address === undefined ? {} : { headers: { "Fly-Client-IP": address } })
    })
    this.socket.on("ping", () => {
      if (this.answering) this.socket.pong()
    })
    this.socket.on("message", () => this.received++)
    this.socket.on("close", () => (this.done = true))
    this.socket.on("error", () => undefined)
  }

  get closed(): boolean {
    return this.done
  }

  /** Like a laptop whose lid has shut: the connection stays up but nothing answers. */
  stopAnsweringPings(): void {
    this.answering = false
  }

  /** Like a stalled network: the server's messages pile up unread. */
  stopReading(): void {
    ;(this.socket as unknown as { _socket: Socket })._socket.pause()
  }

  /** The connection drops without a goodbye, as soon as it is open. */
  drop(): void {
    if (this.socket.readyState === WebSocket.CONNECTING) this.socket.once("open", () => this.socket.terminate())
    else this.socket.terminate()
  }

  /** The server has let this socket in and sent it the game. */
  async expectInGame(): Promise<void> {
    await eventually(
      () => this.received > 0 || this.done,
      () => "the socket to be sent the game"
    )
    if (this.done) throw new Error("the socket was closed, not let in")
  }

  async expectClosed(): Promise<void> {
    await eventually(
      () => this.done,
      () => "the socket to be closed"
    )
  }
}
