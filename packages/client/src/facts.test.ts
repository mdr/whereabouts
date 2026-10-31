import { describe, expect, it, vi } from "vite-plus/test"
import { FactType } from "@whereabouts/shared/facts"
import { wikiTitle } from "@whereabouts/shared/ids"
import { factsOf } from "./facts"

const fact = { type: FactType.FAME, text: "Tall.", source: "https://example.org/tall" }

describe("factsOf", () => {
  it("reads an answer's facts", () => {
    expect(factsOf({ Eiffel: [fact] }, wikiTitle("Eiffel"))).toEqual([fact])
  })

  it("has none for an answer without facts", () => {
    expect(factsOf({}, wikiTitle("Nowhere"))).toBeUndefined()
  })

  it("shows none for malformed facts, and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const all = { Broken: [{ ...fact, type: "GOSSIP" }] }
    expect(factsOf(all, wikiTitle("Broken"))).toBeUndefined()
    expect(factsOf(all, wikiTitle("Broken"))).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
