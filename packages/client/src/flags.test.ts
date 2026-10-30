import { describe, expect, it } from "vite-plus/test"
import flagsJson from "@whereabouts/shared/flags.json" with { type: "json" }
import atlas from "./flag-atlas.json"
import { atlasCell } from "./flag-atlas"
import { flagFile, flagRatio } from "./flags"

const codes = flagsJson.map((f) => f.flag)
const SVGS = import.meta.glob<string>("./assets/flags/*.svg", { query: "?raw", import: "default", eager: true })

describe("flag pictures", () => {
  it("are there for every flag, each sized by a viewBox in the flag's own shape", () => {
    for (const code of codes) {
      const svg = SVGS[`./assets/flags/${code}.svg`]
      expect(svg, code).toBeDefined()
      const root = /<svg\b[^>]*>/.exec(svg!)![0]
      expect(root, code).not.toMatch(/\s(width|height)=/)
      const [, , w, h] = /viewBox="([^"]+)"/
        .exec(root)![1]!
        .split(/[\s,]+/)
        .map(Number)
      expect(w! / h!, code).toBeCloseTo(flagRatio(code), 3)
      expect(flagFile(code), code).toMatch(/\.svg$/)
    }
  })

  it("know each flag's shape before it loads", () => {
    for (const code of codes) {
      expect(flagRatio(code), code).toBeGreaterThanOrEqual(0.8)
      expect(flagRatio(code), code).toBeLessThanOrEqual(2.6)
    }
    expect(flagRatio("np")).toBeLessThan(1)
    expect(flagRatio("ch")).toBe(1)
    expect(flagRatio("qa")).toBeCloseTo(28 / 11, 3)
    expect(flagRatio("fr")).toBe(1.5)
  })

  it("are all in the atlas, each in its own shape and inside its cell", () => {
    expect([...atlas.codes].sort()).toEqual([...codes].sort())
    for (const code of codes) {
      const cell = atlasCell(code)!
      expect(cell.w / cell.h, code).toBeCloseTo(flagRatio(code), 1)
      expect(cell.w, code).toBeLessThanOrEqual(atlas.cell[0]!)
    }
  })
})
