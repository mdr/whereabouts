import { describe, expect, it } from "vite-plus/test"
import { MapDetail } from "@whereabouts/shared/protocol/config"
import { RevealDetail } from "../map/shown-detail"
import type { VrFlagPin } from "./globe/flag-pins"
import type { VrTable } from "./scores/scores"
import { boardOf, flagPinsOf, globeDetail, paintsKey, patchDetail, tableOf } from "./shown"
import { VrPaintsType, VrViewType, type VrReveal, type VrRound, type VrView } from "./view/view"

function makeRound(over: Partial<VrRound> = {}): VrRound {
  return { detail: MapDetail.WATER, ...over } as VrRound
}

function makeReveal(over: Partial<VrReveal> = {}): VrReveal {
  return { stateRound: false, paints: { type: VrPaintsType.OWN }, ...over } as VrReveal
}

const paint = (round = makeRound()): VrView => ({ type: VrViewType.PAINT, round })
const reveal = (over: Partial<VrReveal> = {}, round = makeRound()): VrView => ({
  type: VrViewType.REVEAL,
  round,
  reveal: makeReveal(over)
})
const summary = (type: VrViewType.DONE | VrViewType.LOBBY, over: Record<string, unknown> = {}): VrView =>
  ({ type, summary: over }) as unknown as VrView

const table = (name: string) => name as unknown as VrTable

describe("globeDetail", () => {
  it("shows everything on the reveal", () => {
    expect(globeDetail(reveal())).toBe(RevealDetail.REVEAL)
  })

  it("shows the round's detail while painting", () => {
    expect(globeDetail(paint(makeRound({ detail: MapDetail.POLITICAL })))).toBe(MapDetail.POLITICAL)
  })

  it("shows nothing off a round", () => {
    expect(globeDetail(summary(VrViewType.LOBBY))).toBeUndefined()
    expect(globeDetail(summary(VrViewType.DONE))).toBeUndefined()
  })
})

describe("patchDetail", () => {
  it("is the reveal's state lines on the reveal", () => {
    expect(patchDetail(reveal({ stateRound: true }))).toEqual({ stateRound: true })
  })

  it("is the round's detail while painting", () => {
    expect(patchDetail(paint(makeRound({ detail: MapDetail.PHYSICAL })))).toBe(MapDetail.PHYSICAL)
  })

  it("is nothing without a round", () => {
    expect(patchDetail(summary(VrViewType.LOBBY))).toBeUndefined()
  })
})

describe("tableOf", () => {
  it("is the reveal's table on the reveal, not the round's", () => {
    expect(tableOf(reveal({ table: table("reveal") }, makeRound({ table: table("round") })))).toBe("reveal")
  })

  it("is the summary's off a round", () => {
    expect(tableOf(summary(VrViewType.DONE, { table: table("done") }))).toBe("done")
    expect(tableOf(summary(VrViewType.LOBBY, { table: table("lobby") }))).toBe("lobby")
  })

  it("is the round's while painting", () => {
    expect(tableOf(paint(makeRound({ table: table("round") })))).toBe("round")
  })
})

describe("boardOf", () => {
  it("is the summary's board, and only there", () => {
    const board = {} as NonNullable<ReturnType<typeof boardOf>>
    expect(boardOf(summary(VrViewType.DONE, { board }))).toBe(board)
    expect(boardOf(paint())).toBeUndefined()
  })
})

describe("paintsKey", () => {
  it("is empty off the reveal", () => {
    expect(paintsKey(paint())).toBe("")
  })

  it("is own on a reveal of your own paint", () => {
    expect(paintsKey(reveal())).toBe("own")
  })

  it("joins the players' colours", () => {
    const paints = { type: VrPaintsType.PLAYERS, paints: [{ colour: "red" }, { colour: "blue" }] } as VrReveal["paints"]
    expect(paintsKey(reveal({ paints }))).toBe("red,blue")
  })
})

describe("flagPinsOf", () => {
  const pins = [{}] as VrFlagPin[]

  it("is the pins while flags are on", () => {
    expect(flagPinsOf(reveal({ flags: { on: true, toggle: () => {}, pins } }))).toBe(pins)
  })

  it("is nothing while flags are off, or there are none", () => {
    expect(flagPinsOf(reveal({ flags: { on: false, toggle: () => {}, pins } }))).toBeUndefined()
    expect(flagPinsOf(reveal())).toBeUndefined()
    expect(flagPinsOf(paint())).toBeUndefined()
  })
})
