import { z } from "zod"
import { CloseReason } from "../close-reason.ts"
import {
  PlayerNameSchema,
  PlayerTokenSchema,
  RoomCodeSchema,
  type PlayerName,
  type PlayerToken,
  type RoomCode
} from "../ids.ts"
import { Role } from "../roles.ts"

export const PROTOCOL_VERSION = 15

export enum GameEntryType {
  HOST = "HOST",
  JOIN = "JOIN"
}

/** Host a game: under the given code if any (joining whoever already did), else a fresh one. */
interface HostEntry {
  type: GameEntryType.HOST
  code?: RoomCode
}
interface JoinEntry {
  type: GameEntryType.JOIN
  code: RoomCode
  /** A full game seats a would-be player as a spectator anyway. */
  role: Role
}
/** How a player comes into a game. */
export type GameEntry = HostEntry | JoinEntry

const GameEntrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(GameEntryType.HOST), code: RoomCodeSchema.optional() }),
  z.object({ type: z.literal(GameEntryType.JOIN), code: RoomCodeSchema, role: z.enum(Role) })
]) satisfies z.ZodType<GameEntry>

/** Presented on connect, carried in the WebSocket subprotocol header. */
export interface Ticket {
  v: typeof PROTOCOL_VERSION
  /** Per-player secret used to reclaim the same seat after a reconnect. */
  token: PlayerToken
  name: PlayerName
  entry: GameEntry
}
const TicketSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  token: PlayerTokenSchema,
  name: PlayerNameSchema,
  entry: GameEntrySchema
}) satisfies z.ZodType<Ticket>

// ---- tickets ---------------------------------------------------------------

/**
 * Tickets travel in the Sec-WebSocket-Protocol header, which forbids most
 * punctuation, so they are base64url-encoded JSON. TextEncoder and btoa are
 * available in browsers and Node 22 alike.
 */
export function encodeTicket(ticket: Ticket): string {
  const bytes = new TextEncoder().encode(JSON.stringify(ticket))
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** The ticket, or OUTDATED for one from a client of another protocol version, or undefined for one not a ticket at all. */
export function decodeTicket(raw: string): Ticket | CloseReason.OUTDATED | undefined {
  try {
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/")
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    const result = TicketSchema.safeParse(parsed)
    if (result.success) return result.data
    const versioned = z.object({ v: z.number() }).safeParse(parsed)
    return versioned.success && versioned.data.v !== PROTOCOL_VERSION ? CloseReason.OUTDATED : undefined
  } catch {
    return undefined
  }
}
