import { describe, expect, it } from "vite-plus/test"
import { CATALOGUE, outlinesFrom } from "../catalogue/catalogue.ts"
import { evenMix, mixOf, MapDetail, type QuestionMix } from "../protocol.ts"
import { FeatureType, QuestionType, type Question } from "../questions.ts"
import { pickRounds, type QuestionBank } from "./round-picking.ts"
import outlinesJson from "../../outlines.json" with { type: "json" }

const OUTLINES = outlinesFrom(outlinesJson)
const byId = (id: string) => CATALOGUE.find((q) => q.id === id)!

function pick({
  catalogue = CATALOGUE,
  mix,
  mapDetail = MapDetail.MINIMAL,
  seed = 42
}: {
  catalogue?: readonly Question[]
  mix: QuestionMix
  mapDetail?: MapDetail
  seed?: number
}): Question[] {
  const bank: QuestionBank = { catalogue, outlines: OUTLINES }
  return pickRounds(bank, { mix, mapDetail }, seed)
}

const ofType = (qs: Question[], type: QuestionType) => qs.filter((q) => q.type === type)

describe("pickRounds", () => {
  it("picks the same rounds for the same seed, and others for another", () => {
    const mix = evenMix(8)
    expect(pick({ mix }).map((q) => q.id)).toEqual(pick({ mix }).map((q) => q.id))
    expect(pick({ mix, seed: 43 }).map((q) => q.id)).not.toEqual(pick({ mix }).map((q) => q.id))
  })

  it("asks only the types the mix asks for, each question once", () => {
    const picked = pick({ mix: mixOf({ [QuestionType.PLACE]: 3 }) })
    expect(picked.map((q) => q.type)).toEqual([QuestionType.PLACE, QuestionType.PLACE, QuestionType.PLACE])
    expect(new Set(picked.map((q) => q.id)).size).toBe(3)
  })

  it("asks as many of each type as the mix says, never a country twice", () => {
    const mix = mixOf({ [QuestionType.PLACE]: 3, [QuestionType.COUNTRY]: 4, [QuestionType.FLAG]: 5 })
    const picked = pick({ mix })
    expect(ofType(picked, QuestionType.PLACE)).toHaveLength(3)
    expect(ofType(picked, QuestionType.COUNTRY)).toHaveLength(4)
    expect(ofType(picked, QuestionType.FLAG)).toHaveLength(5)
    const places = picked.map((q) => q.place)
    expect(new Set(places).size).toBe(places.length)
  })

  it("asks as many as the pools hold when the mix asks for more", () => {
    const places = CATALOGUE.filter((q) => q.type === QuestionType.PLACE).slice(0, 3)
    expect(pick({ catalogue: places, mix: evenMix(10) })).toHaveLength(3)
    const mix = mixOf({ [QuestionType.PLACE]: 3, [QuestionType.COUNTRY]: 4 })
    expect(pick({ catalogue: places, mix })).toHaveLength(3)
  })

  it("asks islands, lakes and seas, and US states, as many as the mix says", () => {
    const picked = pick({
      mix: mixOf({ [QuestionType.FEATURE]: 6, [QuestionType.STATE]: 7 }),
      mapDetail: MapDetail.WATER
    })
    expect(ofType(picked, QuestionType.FEATURE)).toHaveLength(6)
    expect(ofType(picked, QuestionType.STATE)).toHaveLength(7)
  })

  it("asks a lake only when the map shows lakes", () => {
    const features = CATALOGUE.filter((q) => q.type === QuestionType.FEATURE)
    const lake = features.find((q) => q.feature === FeatureType.LAKE)!
    const island = features.find((q) => q.feature === FeatureType.ISLAND)!
    const asked = (mapDetail: MapDetail) =>
      pick({ catalogue: [lake, island], mix: mixOf({ [QuestionType.FEATURE]: 2 }), mapDetail }).map((q) => q.id)
    expect(asked(MapDetail.MINIMAL)).toEqual([island.id])
    expect(asked(MapDetail.WATER).sort()).toEqual([island.id, lake.id].sort())
  })

  it("does not ask a place again another way", () => {
    const monaco = CATALOGUE.find((q) => q.type === QuestionType.PLACE && q.place === byId("flag-mc").place)!
    const mix = mixOf({ [QuestionType.PLACE]: 1, [QuestionType.FLAG]: 1 })
    expect(pick({ catalogue: [monaco, byId("flag-mc")], mix }).map((q) => q.id)).toEqual([monaco.id])
  })

  it("keeps a place's country out of the same game when another country will do", () => {
    const gaborone = CATALOGUE.find((q) => q.wiki === "Gaborone")!
    const catalogue = [gaborone, byId("botswana-region"), byId("germany-region")]
    const mix = mixOf({ [QuestionType.PLACE]: 1, [QuestionType.COUNTRY]: 1 })
    for (let seed = 1; seed <= 10; seed++)
      expect(pick({ catalogue, mix, seed }).map((q) => q.id)).toContain("germany-region")
  })
})
