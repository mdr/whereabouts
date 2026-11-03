import { describe, expect, it } from "vite-plus/test"
import { MAX_HINTS } from "../hints.ts"
import { QuestionType } from "../questions.ts"
import { KickSchema } from "./client-messages.ts"
import { ConfigureSchema, MAX_ROUNDS, MapDetail, evenMix, mixOf, type QuestionMix } from "./config.ts"

describe("ConfigureSchema", () => {
  const mix = (counts: Partial<Record<QuestionType, number>>): { mix: QuestionMix } => ({ mix: mixOf(counts) })

  it("accepts supported values and rejects the rest", () => {
    expect(ConfigureSchema.safeParse(mix({ [QuestionType.LANDMARK]: 2, [QuestionType.PLACE]: 2 })).success).toBe(true)
    expect(ConfigureSchema.safeParse({ roundLength: 45_000 }).success).toBe(true)
    expect(ConfigureSchema.safeParse(mix({})).success).toBe(false)
    expect(ConfigureSchema.safeParse(mix({ [QuestionType.LANDMARK]: 8, [QuestionType.PLACE]: 8 })).success).toBe(false)
    expect(ConfigureSchema.safeParse(mix({ [QuestionType.LANDMARK]: -1, [QuestionType.PLACE]: 2 })).success).toBe(false)
    expect(ConfigureSchema.safeParse(mix({ [QuestionType.LANDMARK]: 1.5 })).success).toBe(false)
    expect(ConfigureSchema.safeParse({ mix: { [QuestionType.LANDMARK]: 3 } }).success).toBe(false)
    expect(ConfigureSchema.safeParse({ roundLength: 61_000 }).success).toBe(false)
    expect(ConfigureSchema.safeParse({ mapDetail: MapDetail.POLITICAL }).success).toBe(true)
    expect(ConfigureSchema.safeParse({ mapDetail: "satellite" }).success).toBe(false)
  })

  it.each([
    ["one round", mix({ [QuestionType.FLAG]: 1 }), true],
    ["the most rounds", mix({ [QuestionType.LANDMARK]: 8, [QuestionType.FLAG]: MAX_ROUNDS - 8 }), true],
    ["one round too many", mix({ [QuestionType.LANDMARK]: 8, [QuestionType.FLAG]: MAX_ROUNDS - 7 }), false],
    ["no hints", { hints: 0 }, true],
    ["the most hints", { hints: MAX_HINTS }, true],
    ["one hint too many", { hints: MAX_HINTS + 1 }, false],
    ["fewer than no hints", { hints: -1 }, false]
  ])("at its limits: %s", (_, patch, accepted) => {
    expect(ConfigureSchema.safeParse(patch).success).toBe(accepted)
  })
})

describe("evenMix", () => {
  it("splits the rounds evenly over the first four types, the rest to the first", () => {
    const even = (landmarks: number, places: number, countries: number, flags: number): QuestionMix =>
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
