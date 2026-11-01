// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vite-plus/test"
import { signal } from "@preact/signals"
import { commonsImageUrl } from "@whereabouts/shared/questions"
import { commonsFile, flagCode } from "@whereabouts/shared/ids"
import { MAX_ROUNDS } from "@whereabouts/shared/protocol/config"
import { heldPictures, preloadPictures } from "./preload"
import { loadedVr } from "../vr/vr-support"
import type { Vr } from "../vr/index"

vi.mock("../flags/flags", () => ({ flagUrl: (code: string) => Promise.resolve(`/flags/${code}.svg`) }))
vi.mock("../vr/picture/vr-picture", () => ({ vrPhotoUrl: (file: string) => Promise.resolve(`https://thumb/${file}`) }))

const settle = () => new Promise((resolve) => setTimeout(resolve))

describe("preloadPictures", () => {
  it("holds a whole game's photos and no more, those asked for again counting as new", () => {
    const photo = (index: number) => commonsFile(`${index}.jpg`)
    for (let i = 0; i < 40; i++) preloadPictures({ image: photo(i) })
    preloadPictures({ image: photo(20) })
    const { page } = heldPictures()
    expect(page).toHaveLength(2 * MAX_ROUNDS)
    expect(page.at(-1)).toBe(commonsImageUrl(photo(20)))
    expect(page[0]).toBe(commonsImageUrl(photo(40 - 2 * MAX_ROUNDS)))
  })

  it("loads the headset's renditions too, only while in VR", async () => {
    preloadPictures({ image: commonsFile("a.jpg"), flag: flagCode("fr") })
    await settle()
    expect(heldPictures().headset).toEqual([])
    loadedVr.value = { active: signal(true) } as unknown as Vr
    preloadPictures({ image: commonsFile("b.jpg"), flag: flagCode("de") })
    await settle()
    expect(heldPictures().headset).toEqual(["/flags/de.svg", "https://thumb/b.jpg"])
    loadedVr.value = undefined
  })
})
