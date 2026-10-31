import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE } from "./catalogue.ts"
import { FactType, FactsSchema, factsFor, pickFact, type Fact } from "./facts.ts"
import { sourceUrl } from "./ids.ts"
import facts from "../facts.json" with { type: "json" }

const fact = (type: FactType, text: string): Fact => ({ type, text, source: sourceUrl("https://example.org") })
const place = [
  fact(FactType.FAME, "big"),
  fact(FactType.FAME, "old"),
  fact(FactType.TRIVIA, "odd"),
  fact(FactType.TRIVIA, "fun")
]

describe("picking a fact for the reveal", () => {
  it("gives everyone with the same seed the same fact", () => {
    expect(pickFact(place, "ABCD", 3)).toBe(pickFact(place, "ABCD", 3))
  })

  it("alternates notable facts and trivia by round", () => {
    for (let round = 0; round < 8; round++)
      expect(pickFact(place, "ABCD", round)!.type).toBe(round % 2 === 0 ? FactType.FAME : FactType.TRIVIA)
  })

  it("tells of the flag on a flag round", () => {
    const flag = [fact(FactType.FLAG, "square"), fact(FactType.FLAG, "dragon"), fact(FactType.FAME, "high")]
    for (let round = 0; round < 4; round++) expect(pickFact(flag, "ABCD", round)!.type).toBe(FactType.FLAG)
  })

  it("falls back to whatever there is", () => {
    expect(pickFact([fact(FactType.TRIVIA, "odd")], "ABCD", 0)!.text).toBe("odd")
    expect(pickFact(undefined, "ABCD", 0)).toBeUndefined()
    expect(pickFact([], "ABCD", 0)).toBeUndefined()
  })

  it("varies between games", () => {
    const seen = new Set(Array.from({ length: 20 }, (_, i) => pickFact(place, `game ${i}`, 0)!.text))
    expect(seen).toEqual(new Set(["big", "old"]))
  })
})

describe("the facts", () => {
  const all = FactsSchema.parse(facts)
  const lists = Object.entries(all).flatMap(([place, f]) =>
    [f?.about ?? [], f?.flag ?? []].map((list) => ({ place, list }))
  )

  it("are about places the catalogue asks about", () => {
    const asked = new Set<string>(CATALOGUE.map((q) => q.place))
    expect(Object.keys(all).filter((place) => !asked.has(place))).toEqual([])
  })

  it("are short single sentences", () => {
    for (const { place, list } of lists)
      for (const f of list) expect(f.text.split(/\s+/).length, `${place}: ${f.text}`).toBeLessThanOrEqual(25)
  })

  it("give every round at least one", () => {
    for (const q of CATALOGUE) expect(factsFor(all[q.place], q.type)?.length, q.id).toBeGreaterThan(0)
  })
})
