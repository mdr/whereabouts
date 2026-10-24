import { describe, expect, it } from "vite-plus/test"
import { cellToChildren, cellToLatLng, h3Res, latLngToCell, type H3Cell } from "@whereabouts/shared"
import { landCells } from "./globe-texture"

describe("the VR globe's land", () => {
  it("covers every finest cell of a coarse one, though the coarse hexagon does not", () => {
    const coarse = latLngToCell(34.8, 69.6, h3Res(2))
    const drawn = new Set<H3Cell>(landCells({ res: 4, cells: [coarse] }))
    const under = (k: H3Cell, res: number) => {
      const [lat, lon] = cellToLatLng(k)
      return latLngToCell(lat, lon, h3Res(res))
    }
    const finest = cellToChildren(coarse, h3Res(4))
    expect(finest.filter((k) => under(k, 2) !== coarse).length).toBeGreaterThan(0)
    expect(finest.filter((k) => ![2, 3, 4].some((r) => drawn.has(under(k, r))))).toEqual([])
  })
})
