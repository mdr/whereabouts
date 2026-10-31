import { describe, expect, it } from "vite-plus/test"
import {
  ConfigureSchema,
  KickSchema,
  PROTOCOL_VERSION,
  decodeTicket,
  encodeTicket,
  evenMix,
  mixOf,
  type Ticket,
  MapDetail
} from "./protocol.ts"
import { QuestionType } from "./questions.ts"
import { CloseReason } from "./close-reason.ts"
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
    expect(decodeTicket(enc({ v: PROTOCOL_VERSION - 1, token: "x" }))).toBe(CloseReason.OUTDATED)
    expect(decodeTicket(enc({ ...ticket, v: PROTOCOL_VERSION + 1 }))).toBe(CloseReason.OUTDATED)
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
  const mix = (counts: Partial<Record<QuestionType, number>>) => ({ mix: mixOf(counts) })

  it("accepts supported values and rejects the rest", () => {
    expect(ConfigureSchema.safeParse(mix({ [QuestionType.LANDMARK]: 2, [QuestionType.PLACE]: 2 })).success).toBe(true)
    expect(ConfigureSchema.safeParse({ roundMs: 45_000 }).success).toBe(true)
    expect(ConfigureSchema.safeParse(mix({})).success).toBe(false)
    expect(ConfigureSchema.safeParse(mix({ [QuestionType.LANDMARK]: 8, [QuestionType.PLACE]: 8 })).success).toBe(false)
    expect(ConfigureSchema.safeParse(mix({ [QuestionType.LANDMARK]: -1, [QuestionType.PLACE]: 2 })).success).toBe(false)
    expect(ConfigureSchema.safeParse(mix({ [QuestionType.LANDMARK]: 1.5 })).success).toBe(false)
    expect(ConfigureSchema.safeParse({ mix: { [QuestionType.LANDMARK]: 3 } }).success).toBe(false)
    expect(ConfigureSchema.safeParse({ roundMs: 61_000 }).success).toBe(false)
    expect(ConfigureSchema.safeParse({ mapDetail: MapDetail.POLITICAL }).success).toBe(true)
    expect(ConfigureSchema.safeParse({ mapDetail: "satellite" }).success).toBe(false)
  })
})

describe("evenMix", () => {
  it("splits the rounds evenly over the first four types, the rest to the first", () => {
    const even = (landmarks: number, places: number, countries: number, flags: number) =>
      mixOf({
        [QuestionType.LANDMARK]: landmarks,
        [QuestionType.PLACE]: places,
        [QuestionType.COUNTRY]: countries,
        [QuestionType.FLAG]: flags
      })
    expect(evenMix(8)).toEqual(even(2, 2, 2, 2))
    expect(evenMix(6)).toEqual(even(2, 2, 1, 1))
    expect(evenMix(1)).toEqual(even(1, 0, 0, 0))
  })
})

describe("kick schema", () => {
  it("needs a player id", () => {
    expect(KickSchema.safeParse({ playerId: "p2" }).success).toBe(true)
    expect(KickSchema.safeParse({}).success).toBe(false)
    expect(KickSchema.safeParse({ playerId: "" }).success).toBe(false)
  })
})
