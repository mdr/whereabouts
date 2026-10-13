import { describe, expect, it } from "vitest"
import { flagCode, playerId, playerToken, questionId, regionId, roomCode } from "./ids.ts"
import { KickSchema, TicketSchema } from "./protocol.ts"

describe("identifiers", () => {
  it("are made only from strings of their own format", () => {
    expect(playerId("p12")).toBe("p12")
    for (const bad of ["p0", "p", "P1", "alice"]) expect(() => playerId(bad), bad).toThrow()
    expect(() => playerToken("short")).toThrow()
    expect(roomCode("AB12")).toBe("AB12")
    for (const bad of ["ab12", "ABC", "ABCDEFG"]) expect(() => roomCode(bad), bad).toThrow()
    expect(questionId("flag-de")).toBe("flag-de")
    expect(regionId("island-borneo")).toBe("island-borneo")
    for (const bad of ["Germany", "-de", "a--b", ""]) expect(() => regionId(bad), bad).toThrow()
    expect(flagCode("de")).toBe("de")
    for (const bad of ["DE", "deu", "d"]) expect(() => flagCode(bad), bad).toThrow()
  })

  it("come out of the wire schemas checked", () => {
    expect(KickSchema.safeParse({ playerId: "p2" }).success).toBe(true)
    expect(KickSchema.safeParse({ playerId: "0123456789abcdef" }).success).toBe(false)
    const ticket = { v: 1, token: "0123456789abcdef", name: "Ann" }
    expect(TicketSchema.safeParse({ ...ticket, code: "AB12" }).success).toBe(true)
    expect(TicketSchema.safeParse({ ...ticket, code: "ab12" }).success).toBe(false)
  })
})
