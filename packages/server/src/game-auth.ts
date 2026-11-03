import { AuthMiddleware, type AuthResult, type ConnectionContext, type RoomManager } from "@rivalis/core"
import { CloseReason, isCloseReason } from "@whereabouts/shared/close-reason"
import { generateCode } from "@whereabouts/shared/ids"
import { decodeTicket, GameEntryType } from "@whereabouts/shared/protocol/ticket"
import { ROOM_TYPE, closeReason, type ActorData } from "./rooms.ts"
import { logEvent } from "./telemetry/log-event.ts"
import { LOG_CODES } from "./telemetry/log-codes.ts"
import type { Telemetry } from "./telemetry/telemetry.ts"
import { TicketRefused } from "./vendor/WSTransport.ts"
import { CLOSE_REASON_TEXT } from "./telemetry/close-reason-text.ts"

/**
 * Parses the ticket, creates the room for hosts, and routes joiners to their
 * game by code. Whether they may join is the game's call (Game.join).
 */
export class GameAuth extends AuthMiddleware<ActorData> {
  private rooms: () => RoomManager<ActorData>
  private telemetry: Telemetry
  private random: () => number

  constructor(rooms: () => RoomManager<ActorData>, telemetry: Telemetry, random: () => number = Math.random) {
    super()
    this.rooms = rooms
    this.telemetry = telemetry
    this.random = random
  }

  override async authenticate(ticket: string, context?: ConnectionContext): Promise<AuthResult<ActorData>> {
    const address = context?.remoteId ?? "unknown"
    try {
      return this.route(ticket, address)
    } catch (error) {
      if (error instanceof TicketRefused) {
        const reason = isCloseReason(error.reason) ? CLOSE_REASON_TEXT[error.reason] : error.reason
        if (isCloseReason(error.reason)) this.telemetry.metrics.countTurnedAway(error.reason)
        logEvent(this.telemetry.logger, LOG_CODES.connection.refused, `refused a connection: ${reason}`, {
          address,
          reason
        })
      }
      throw error
    }
  }

  private route(ticket: string, address: string): AuthResult<ActorData> {
    const parsed = decodeTicket(ticket)
    if (parsed === CloseReason.OUTDATED) throw new TicketRefused(closeReason(CloseReason.OUTDATED))
    if (!parsed) throw new TicketRefused(closeReason(CloseReason.NO_SUCH_GAME))
    const rooms = this.rooms()
    const { entry } = parsed
    let roomId: string
    if (entry.type === GameEntryType.JOIN) {
      if (!rooms.get(entry.code)) throw new TicketRefused(closeReason(CloseReason.NO_SUCH_GAME))
      roomId = entry.code
    } else if (entry.code) {
      // Hosting again under an old code; if someone just did, join them.
      roomId = entry.code
      if (!rooms.get(roomId)) rooms.create(ROOM_TYPE, roomId)
    } else {
      roomId = generateCode(this.random)
      for (let i = 0; i < 20 && rooms.get(roomId); i++) roomId = generateCode(this.random)
      if (rooms.get(roomId)) throw new TicketRefused(closeReason(CloseReason.UNAVAILABLE))
      rooms.create(ROOM_TYPE, roomId)
    }
    return { data: { token: parsed.token, name: parsed.name, entry, address }, roomId }
  }
}
