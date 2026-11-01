import { describe, expect, it } from "vite-plus/test"
import { cellToBoundary, cellToChildren, cellToLatLng, h3Res, latLngToCell, type H3Cell } from "@whereabouts/shared/h3"
import { Vector3 } from "three"
import { cellRing, landCells } from "./globe-texture"
import { latLonToLocal } from "./sphere"

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

  it("draws a big cell's edges along the great circles, not straight across the flat picture", () => {
    const cell = latLngToCell(65, 100, h3Res(1))
    const ring = cellRing(cell)!.map(([lon, lat]) => latLonToLocal({ lat: lat!, lon: lon! }))
    const corners = cellToBoundary(cell, true).map(([lon, lat]) => latLonToLocal({ lat, lon }))
    for (let i = 0; i < corners.length - 1; i++) {
      const middle = new Vector3().addVectors(corners[i]!, corners[i + 1]!).normalize()
      const nearest = Math.min(...ring.map((p) => p.angleTo(middle)))
      expect(nearest).toBeLessThan((0.1 * Math.PI) / 180)
    }
  })
})
