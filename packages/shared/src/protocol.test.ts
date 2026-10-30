import { describe, expect, it } from "vite-plus/test"
import { KickSchema, PROTOCOL_VERSION, decodeTicket, encodeTicket, type Ticket } from "./protocol.ts"
import { playerName, playerToken, roomCode } from "./ids.ts"

describe("ticket codec", () => {
  const ticket: Ticket = {
    v: PROTOCOL_VERSION,
    token: playerToken("0123456789abcdef0123456789abcdef"),
    name: playerName("Zoë 🌍"),
    code: roomCode("AB12")
  }

  it("round-trips unicode names and stays header-safe", () => {
    const raw = encodeTicket(ticket)
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeTicket(raw)).toEqual(ticket)
  })

  /** Encode an arbitrary object the same way a hostile client might. */
  const enc = (value: unknown) => encodeTicket(value as Ticket)

  it("rejects garbage, wrong versions and bad shapes", () => {
    expect(decodeTicket("not-base64!!")).toBeUndefined()
    expect(decodeTicket(enc({}))).toBeUndefined()
    expect(decodeTicket(enc({ v: PROTOCOL_VERSION - 1, token: "x" }))).toBe("outdated")
    expect(decodeTicket(enc({ ...ticket, v: PROTOCOL_VERSION + 1 }))).toBe("outdated")
    expect(decodeTicket(enc({ ...ticket, token: "short" }))).toBeUndefined()
    expect(decodeTicket(enc({ ...ticket, code: "ab12" }))).toBeUndefined()
    expect(decodeTicket(enc({ ...ticket, name: "   " }))).toBeUndefined()
    expect(decodeTicket(enc("a string"))).toBeUndefined()
  })

  it("trims names", () => {
    expect(decodeTicket(enc({ ...ticket, name: "  Matt  " }))).toMatchObject({ name: "Matt" })
  })
})

describe("ConfigureSchema", () => {
  it("accepts supported values and rejects the rest", async () => {
    const { ConfigureSchema } = await import("./protocol.ts")
    const mix = (landmarks: number, places: number, countries: number, flags: number) => ({
      mix: { landmarks, places, countries, flags }
    })
    expect(ConfigureSchema.safeParse(mix(2, 2, 2, 2)).success).toBe(true)
    expect(ConfigureSchema.safeParse({ roundMs: 45_000 }).success).toBe(true)
    expect(ConfigureSchema.safeParse(mix(0, 0, 0, 0)).success).toBe(false)
    expect(ConfigureSchema.safeParse(mix(4, 4, 4, 4)).success).toBe(false)
    expect(ConfigureSchema.safeParse(mix(-1, 2, 0, 0)).success).toBe(false)
    expect(ConfigureSchema.safeParse(mix(1.5, 2, 0, 0)).success).toBe(false)
    expect(ConfigureSchema.safeParse({ mix: { landmarks: 3 } }).success).toBe(false)
    // A mix from before islands, lakes, seas and US states asks none of them.
    expect(ConfigureSchema.parse({ mix: { landmarks: 3, places: 2, countries: 0, flags: 0 } }).mix).toMatchObject({
      features: 0,
      states: 0
    })
    expect(ConfigureSchema.safeParse({ roundMs: 61_000 }).success).toBe(false)
    expect(ConfigureSchema.safeParse({ mapDetail: "political" }).success).toBe(true)
    expect(ConfigureSchema.safeParse({ mapDetail: "satellite" }).success).toBe(false)
  })
})

describe("evenMix", () => {
  it("splits the rounds evenly, the rest to the first kinds", async () => {
    const { evenMix } = await import("./protocol.ts")
    const none = { features: 0, states: 0 }
    expect(evenMix(8)).toEqual({ landmarks: 2, places: 2, countries: 2, flags: 2, ...none })
    expect(evenMix(6)).toEqual({ landmarks: 2, places: 2, countries: 1, flags: 1, ...none })
    expect(evenMix(1)).toEqual({ landmarks: 1, places: 0, countries: 0, flags: 0, ...none })
  })
})

describe("kick schema", () => {
  it("needs a player id", () => {
    expect(KickSchema.safeParse({ playerId: "p2" }).success).toBe(true)
    expect(KickSchema.safeParse({}).success).toBe(false)
    expect(KickSchema.safeParse({ playerId: "" }).success).toBe(false)
  })
})
