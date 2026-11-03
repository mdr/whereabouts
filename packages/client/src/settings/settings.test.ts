// @vitest-environment happy-dom
import type * as Settings from "./settings"
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { MapDetail } from "@whereabouts/shared/protocol/config"
import { QuestionType } from "@whereabouts/shared/questions"
import { KernelId } from "@whereabouts/shared/scoring/scoring"
import { GuessType } from "@whereabouts/shared/scoring/score-verdict"

/** The settings as a page loading with these values stored would read them. */
const settingsWith = async (stored: Record<string, string>): Promise<typeof Settings> => {
  for (const [key, value] of Object.entries(stored)) localStorage.setItem(key, value)
  vi.resetModules()
  return import("./settings")
}

afterEach(() => localStorage.clear())

describe("settings stored by older builds", () => {
  it("read a map detail and kernel saved in lower case", async () => {
    const settings = await settingsWith({ "wa.mapDetail": "political", "wa.practiceKernel": "multi-weighted" })
    expect(settings.soloMapDetail.value).toBe(MapDetail.POLITICAL)
    expect(settings.soloKernelId.value).toBe(KernelId.MULTI_WEIGHTED)
  })

  it("turn the old practice pool into the types it asked", async () => {
    const settings = await settingsWith({ "wa.practicePool": "places" })
    expect(settings.soloTypes.value).toEqual([QuestionType.LANDMARK, QuestionType.PLACE])
    expect(localStorage.getItem("wa.practicePool") ?? undefined).toBeUndefined()
  })

  it("prefer the practice types to an old pool still stored", async () => {
    const settings = await settingsWith({ "wa.practiceTypes": "FLAG", "wa.practicePool": "places" })
    expect(settings.soloTypes.value).toEqual([QuestionType.FLAG])
  })

  it("read score verdicts whose guesses were saved in lower case", async () => {
    const verdict = { set: 1, index: 0, at: "2026-10-01", guess: "near-miss", verdict: 1, case: "x" }
    const settings = await settingsWith({ "wa.scoreVerdicts": JSON.stringify([verdict]) })
    expect(settings.scoreVerdicts.value).toEqual([{ ...verdict, guess: GuessType.NEAR_MISS }])
  })
})

describe("settings stored unreadably", () => {
  it("start from the default when the stored value is the wrong shape", async () => {
    const settings = await settingsWith({ "wa.scoreVerdicts": "null", "wa.reviewSet": '"two"' })
    expect(settings.scoreVerdicts.value).toEqual([])
    expect(settings.reviewSet.value).toBe(1)
  })

  it("keep the verdicts that can be read, dropping the rest", async () => {
    const good = {
      set: 2,
      index: 3,
      at: "2026-10-31",
      pair: true,
      guesses: ["WIDE", "HEDGE"],
      prefer: -1,
      cases: ["a", "b"]
    }
    const settings = await settingsWith({ "wa.scoreVerdicts": `[${JSON.stringify(good)}, {"set": "junk"}, null]` })
    expect(settings.scoreVerdicts.value).toEqual([good])
  })

  it("drop a practice type that is no longer offered, keeping the others", async () => {
    const settings = await settingsWith({ "wa.practiceTypes": "FLAG,RIVER" })
    expect(settings.soloTypes.value).toEqual([QuestionType.FLAG])
  })

  it("start from the default practice types when none can be read", async () => {
    const settings = await settingsWith({ "wa.practiceTypes": "RIVER" })
    expect(settings.soloTypes.value).toEqual([QuestionType.LANDMARK, QuestionType.PLACE])
  })
})
