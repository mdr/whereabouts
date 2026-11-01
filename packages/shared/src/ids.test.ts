import { describe, expect, it } from "vite-plus/test"
import { flagCode, generateCode, playerId, playerToken, questionId, outlineId, roomCode } from "./ids.ts"
import { GameEntryType, PROTOCOL_VERSION, decodeTicket, encodeTicket, type Ticket } from "./protocol/ticket.ts"
import { KickSchema } from "./protocol/client-messages.ts"

describe("identifiers", () => {
  it("are made only from strings of their own format", () => {
    expect(playerId("p12")).toBe("p12")
    for (const bad of ["p0", "p", "P1", "alice"]) expect(() => playerId(bad), bad).toThrow()
    expect(() => playerToken("short")).toThrow()
    expect(roomCode("AB12")).toBe("AB12")
    for (const bad of ["ab12", "ABC", "ABCDEFG"]) expect(() => roomCode(bad), bad).toThrow()
    expect(questionId("flag-de")).toBe("flag-de")
    expect(outlineId("island-borneo")).toBe("island-borneo")
    for (const bad of ["Germany", "-de", "a--b", ""]) expect(() => outlineId(bad), bad).toThrow()
    expect(flagCode("de")).toBe("de")
    for (const bad of ["DE", "deu", "d"]) expect(() => flagCode(bad), bad).toThrow()
  })

  it("come out of the wire schemas checked", () => {
    expect(KickSchema.safeParse({ playerId: "p2" }).success).toBe(true)
    expect(KickSchema.safeParse({ playerId: "0123456789abcdef" }).success).toBe(false)
    const ticket = (code: string) =>
      encodeTicket({
        v: PROTOCOL_VERSION,
        token: "0123456789abcdef",
        name: "Ann",
        entry: { type: GameEntryType.HOST, code }
      } as Ticket)
    expect(decodeTicket(ticket("AB12"))).toMatchObject({ entry: { code: "AB12" } })
    expect(decodeTicket(ticket("ab12"))).toBeUndefined()
  })
})

describe("generateCode", () => {
  it("uses the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/)
  })
})
