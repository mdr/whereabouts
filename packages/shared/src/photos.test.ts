import { describe, expect, it } from "vite-plus/test"
import { QUESTIONS } from "./questions.ts"
import { REVEAL_PHOTOS, revealPhoto } from "./photos.ts"
import { regionFrom, type RegionData } from "./regions.ts"
import regionsJson from "../regions.json" with { type: "json" }
import featuresJson from "../features.json" with { type: "json" }

describe("the reveal photos", () => {
  const answers = new Set([
    ...QUESTIONS.map((q) => q.wiki),
    ...(regionsJson as { wiki: string }[]).map((r) => r.wiki),
    ...(featuresJson as { wiki: string }[]).map((f) => f.wiki)
  ])

  it("are for answers the game asks about", () => {
    for (const wiki of Object.keys(REVEAL_PHOTOS)) expect(answers.has(wiki), wiki).toBe(true)
  })

  it("are JPEG files, none of them a photo round's own photo", () => {
    const asked = new Set(QUESTIONS.map((q) => q.image))
    for (const [wiki, file] of Object.entries(REVEAL_PHOTOS)) {
      expect(file, wiki).toMatch(/\.jpe?g$/i)
      expect(file, wiki).not.toMatch(/^File:/)
      expect(asked.has(file), `${wiki}: ${file}`).toBe(false)
    }
  })

  it("give every place-name round a photo", () => {
    for (const q of QUESTIONS.filter((q) => q.kind === "text")) expect(revealPhoto(q), q.id).toBeDefined()
  })

  it("give every island, lake, sea and US state round a photo", () => {
    for (const f of featuresJson as { wiki: string }[]) expect(REVEAL_PHOTOS[f.wiki], f.wiki).toBeDefined()
  })

  it("show no photo on a country round, which shows the flag", () => {
    for (const q of (regionsJson as RegionData[]).map(regionFrom)) expect(revealPhoto(q), q.label).toBeUndefined()
  })

  it("leave photo rounds their own photo", () => {
    for (const q of QUESTIONS.filter((q) => q.kind === "photo")) expect(revealPhoto(q), q.id).toBeUndefined()
  })
})
