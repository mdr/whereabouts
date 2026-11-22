/** Whole question mixes the host can pick at once, the first being the game's default. */
import { DEFAULT_MIX, evenMix, mixOf, type QuestionMix } from "@whereabouts/shared/protocol/config"
import { QUESTION_TYPES, QuestionType } from "@whereabouts/shared/questions"

export enum MixPreset {
  DEFAULT = "DEFAULT",
  QUICK = "QUICK",
  EVERYTHING = "EVERYTHING",
  MARATHON = "MARATHON"
}

const everyType = (each: number): QuestionMix => mixOf(Object.fromEntries(QUESTION_TYPES.map((type) => [type, each])))

export const MIX_PRESETS: readonly { value: MixPreset; label: string; mix: QuestionMix }[] = [
  { value: MixPreset.DEFAULT, label: "Default", mix: DEFAULT_MIX },
  { value: MixPreset.QUICK, label: "Quick", mix: evenMix(4) },
  { value: MixPreset.EVERYTHING, label: "Everything", mix: everyType(2) },
  {
    value: MixPreset.MARATHON,
    label: "Marathon",
    mix: { ...everyType(4), [QuestionType.LANDMARK]: 5, [QuestionType.PLACE]: 5 }
  }
]

/** The preset this mix is exactly, if any. */
export const presetOf = (mix: QuestionMix): MixPreset | undefined =>
  MIX_PRESETS.find((preset) => QUESTION_TYPES.every((type) => preset.mix[type] === mix[type]))?.value

export const presetMix = (preset: MixPreset): QuestionMix => MIX_PRESETS.find((option) => option.value === preset)!.mix
