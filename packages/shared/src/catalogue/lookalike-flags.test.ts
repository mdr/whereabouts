import { describe, expect, it } from "vite-plus/test"
import { flagCode, sourceUrl } from "../ids.ts"
import { CATALOGUE, isFlagQuestion } from "./catalogue.ts"
import { LOOKALIKE_GROUPS, lookalikesOf, type LookalikeGroup } from "./lookalike-flags.ts"

const id = flagCode("id")
const mc = flagCode("mc")
const pl = flagCode("pl")
const italy = flagCode("it")
const group = (flags: Record<string, string>): LookalikeGroup => ({
  flags: new Map(Object.entries(flags).map(([code, tip]) => [flagCode(code), tip])),
  source: sourceUrl("https://example.org")
})
const groups = [group({ id: "longer", mc: "squarer", pl: "white on top" }), group({ it: "plain", ie: "green, orange" })]

describe("lookalikesOf", () => {
  it("puts the answer's flag first, and the look-alike painted next to it", () => {
    expect(lookalikesOf(id, pl, groups)).toEqual({
      flags: [
        { code: id, tip: "longer" },
        { code: pl, tip: "white on top" },
        { code: mc, tip: "squarer" }
      ],
      mistaken: pl
    })
  })

  it("still shows the look-alikes when the paint was right, or elsewhere", () => {
    for (const painted of [id, italy, undefined]) {
      const lookalikes = lookalikesOf(id, painted, groups)!
      expect(lookalikes.flags.map((flag) => flag.code)).toEqual([id, mc, pl])
      expect(lookalikes.mistaken).toBeUndefined()
    }
  })

  it("is undefined for a flag like no other", () => {
    expect(lookalikesOf(flagCode("jp"), undefined, groups)).toBeUndefined()
  })
})

describe("the look-alike flags", () => {
  const flags = new Set(CATALOGUE.filter(isFlagQuestion).map((question) => question.clue.flag))

  it("are flags the game asks about, at least two to a group", () => {
    for (const { flags: groupFlags } of LOOKALIKE_GROUPS) {
      expect(groupFlags.size).toBeGreaterThanOrEqual(2)
      for (const code of groupFlags.keys()) expect(flags.has(code), code).toBe(true)
    }
  })

  it("have short tips", () => {
    for (const { flags: groupFlags } of LOOKALIKE_GROUPS)
      for (const [code, tip] of groupFlags) expect(tip.split(/\s+/).length, `${code}: ${tip}`).toBeLessThanOrEqual(10)
  })
})
