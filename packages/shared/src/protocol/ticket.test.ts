import { describe, expect, it } from "vite-plus/test"
import { CloseReason } from "../close-reason.ts"
import { playerName, playerToken, roomCode } from "../ids.ts"
import { Role } from "../roles.ts"
import { GameEntryType, PROTOCOL_VERSION, decodeTicket, encodeTicket, type Ticket } from "./ticket.ts"

describe("ticket codec", () => {
  const ticket: Ticket = {
    v: PROTOCOL_VERSION,
    token: playerToken("0123456789abcdef0123456789abcdef"),
    name: playerName("Zoë 🌍"),
    entry: { type: GameEntryType.JOIN, code: roomCode("AB12"), role: Role.PLAYER }
  }

  it("round-trips unicode names and stays header-safe", () => {
    const raw = encodeTicket(ticket)
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeTicket(raw)).toEqual(ticket)
  })

  /** Encode an arbitrary object the same way a hostile client might. */
  const encode = (value: unknown): string => encodeTicket(value as Ticket)

  it("rejects garbage, wrong versions and bad shapes", () => {
    expect(decodeTicket("not-base64!!")).toBeUndefined()
    expect(decodeTicket(encode({}))).toBeUndefined()
    expect(decodeTicket(encode({ v: PROTOCOL_VERSION - 1, token: "x" }))).toBe(CloseReason.OUTDATED)
    expect(decodeTicket(encode({ ...ticket, v: PROTOCOL_VERSION + 1 }))).toBe(CloseReason.OUTDATED)
    expect(decodeTicket(encode({ ...ticket, token: "short" }))).toBeUndefined()
    expect(decodeTicket(encode({ ...ticket, entry: { ...ticket.entry, code: "ab12" } }))).toBeUndefined()
    expect(decodeTicket(encode({ ...ticket, entry: { type: GameEntryType.JOIN, code: "AB12" } }))).toBeUndefined()
    expect(decodeTicket(encode({ ...ticket, name: "   " }))).toBeUndefined()
    expect(decodeTicket(encode("a string"))).toBeUndefined()
  })

  it("trims names", () => {
    expect(decodeTicket(encode({ ...ticket, name: "  Matt  " }))).toMatchObject({ name: "Matt" })
  })
})
