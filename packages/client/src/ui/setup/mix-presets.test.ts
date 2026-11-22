import { describe, expect, it } from "vite-plus/test"
import { DEFAULT_MIX, MAX_ROUNDS, MixSchema, mixOf, mixTotal } from "@whereabouts/shared/protocol/config"
import { QuestionType } from "@whereabouts/shared/questions"
import { MIX_PRESETS, MixPreset, presetMix, presetOf } from "./mix-presets"

describe("mix presets", () => {
  it("are each a mix a game accepts", () => {
    for (const preset of MIX_PRESETS) expect(MixSchema.safeParse(preset.mix).success, preset.value).toBe(true)
  })

  it("start with the game's default, which resets the mix", () => {
    expect(presetMix(MixPreset.DEFAULT)).toEqual(DEFAULT_MIX)
  })

  it("run from a quick game to the longest", () => {
    expect(mixTotal(presetMix(MixPreset.QUICK))).toBe(4)
    expect(mixTotal(presetMix(MixPreset.EVERYTHING))).toBe(14)
    expect(mixTotal(presetMix(MixPreset.MARATHON))).toBe(MAX_ROUNDS)
  })

  it("are recognised in a mix that matches one exactly, and only then", () => {
    for (const preset of MIX_PRESETS) expect(presetOf({ ...preset.mix })).toBe(preset.value)
    expect(presetOf({ ...DEFAULT_MIX, [QuestionType.FLAG]: 3 })).toBeUndefined()
    expect(presetOf(mixOf({ [QuestionType.STATE]: 1 }))).toBeUndefined()
  })
})
