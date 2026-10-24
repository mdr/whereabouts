import { describe, expect, it } from "vite-plus/test"
import { pickFact, type Fact } from "./facts.ts"
import facts from "../facts.json" with { type: "json" }

const fact = (kind: Fact["kind"], text: string): Fact => ({ kind, text, source: "https://example.org" })
const place = [fact("fame", "big"), fact("fame", "old"), fact("trivia", "odd"), fact("trivia", "fun")]

describe("picking a fact for the reveal", () => {
  it("gives everyone with the same seed the same fact", () => {
    expect(pickFact(place, "ABCD", 3)).toBe(pickFact(place, "ABCD", 3))
  })

  it("alternates notable facts and trivia by round", () => {
    for (let round = 0; round < 8; round++)
      expect(pickFact(place, "ABCD", round)!.kind).toBe(round % 2 === 0 ? "fame" : "trivia")
  })

  it("tells of the flag on a flag round", () => {
    const flag = [fact("flag", "square"), fact("flag", "dragon"), fact("fame", "high")]
    for (let round = 0; round < 4; round++) expect(pickFact(flag, "ABCD", round)!.kind).toBe("flag")
  })

  it("falls back to whatever there is", () => {
    expect(pickFact([fact("trivia", "odd")], "ABCD", 0)!.text).toBe("odd")
    expect(pickFact(undefined, "ABCD", 0)).toBeUndefined()
    expect(pickFact([], "ABCD", 0)).toBeUndefined()
  })

  it("varies between games", () => {
    const seen = new Set(Array.from({ length: 20 }, (_, i) => pickFact(place, `game ${i}`, 0)!.text))
    expect(seen).toEqual(new Set(["big", "old"]))
  })
})

describe("the facts", () => {
  const all = Object.entries(facts as Record<string, Fact[]>)

  it("are short single sentences, each with its source", () => {
    for (const [wiki, list] of all)
      for (const f of list) {
        expect(f.text.split(/\s+/).length, `${wiki}: ${f.text}`).toBeLessThanOrEqual(25)
        expect(["fame", "trivia", "flag"]).toContain(f.kind)
        expect(f.source).toMatch(/^https:\/\//)
      }
  })

  it("give every answer at least one", () => {
    for (const [wiki, list] of all) expect(list.length, wiki).toBeGreaterThan(0)
  })
})
