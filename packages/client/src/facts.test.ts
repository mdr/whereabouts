import { describe, expect, it, vi } from "vite-plus/test"
import { FactType } from "@whereabouts/shared/facts"
import { placeId } from "@whereabouts/shared/ids"
import { factsOf } from "./facts"

const fact = { type: FactType.FAME, text: "Tall.", source: "https://example.org/tall" }

describe("factsOf", () => {
  it("reads a place's facts", () => {
    expect(factsOf({ eiffel: { about: [fact] } }, placeId("eiffel"))).toEqual({ about: [fact] })
  })

  it("has none for a place without facts", () => {
    expect(factsOf({}, placeId("nowhere"))).toBeUndefined()
  })

  it("shows none for malformed facts, and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const all = { broken: { about: [{ ...fact, type: "GOSSIP" }] } }
    expect(factsOf(all, placeId("broken"))).toBeUndefined()
    expect(factsOf(all, placeId("broken"))).toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
