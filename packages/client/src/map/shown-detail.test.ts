import { describe, expect, it } from "vite-plus/test"
import { MapDetail, showsLakes } from "@whereabouts/shared/protocol/config"
import {
  RevealDetail,
  showsBorders,
  showsInlandWater,
  showsPlaces,
  showsTerrain,
  type ShownDetail
} from "./shown-detail"

const shown = (detail: ShownDetail) => ({
  water: showsInlandWater(detail),
  terrain: showsTerrain(detail),
  borders: showsBorders(detail),
  places: showsPlaces(detail)
})

describe("shown detail", () => {
  it("adds to each level what the one before showed", () => {
    expect(shown(MapDetail.MINIMAL)).toEqual({ water: false, terrain: false, borders: false, places: false })
    expect(shown(MapDetail.WATER)).toEqual({ water: true, terrain: false, borders: false, places: false })
    expect(shown(MapDetail.PHYSICAL)).toEqual({ water: true, terrain: true, borders: false, places: false })
    expect(shown(MapDetail.POLITICAL)).toEqual({ water: true, terrain: true, borders: true, places: false })
    expect(shown(RevealDetail.REVEAL)).toEqual({ water: true, terrain: true, borders: true, places: true })
  })

  it("draws lakes exactly where lake rounds are asked", () => {
    for (const detail of Object.values(MapDetail)) expect(showsInlandWater(detail), detail).toBe(showsLakes(detail))
  })

  it("treats a level it does not know, from a stale saved setting, as minimal", () => {
    expect(shown("satellite" as MapDetail)).toEqual(shown(MapDetail.MINIMAL))
  })
})
