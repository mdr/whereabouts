// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vite-plus/test"
import { MapDetail } from "@whereabouts/shared/protocol"
import { QuestionType } from "@whereabouts/shared/questions"
import { KernelId } from "@whereabouts/shared/scoring"

/** The settings as a page loading with these values stored would read them. */
async function settingsWith(stored: Record<string, string>) {
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
})
