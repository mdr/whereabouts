import { describe, expect, it } from "vite-plus/test"
import {
  cellBoundaryLonLat,
  cellToChildren,
  cellToLatLng,
  h3Resolution,
  latLngToCell,
  type H3Cell
} from "@whereabouts/shared/h3"
import { Vector3 } from "three"
import { cellRing, landCells } from "./globe-texture"
import { latLonToLocal } from "./sphere"

describe("the VR globe's land", () => {
  it("covers every finest cell of a coarse one, though the coarse hexagon does not", () => {
    const coarse = latLngToCell(34.8, 69.6, h3Resolution(2))
    const drawn = new Set<H3Cell>(landCells({ resolution: 4, cells: [coarse] }))
    const under = (cell: H3Cell, resolution: number) => {
      const [lat, lon] = cellToLatLng(cell)
      return latLngToCell(lat, lon, h3Resolution(resolution))
    }
    const finest = cellToChildren(coarse, h3Resolution(4))
    expect(finest.filter((cell) => under(cell, 2) !== coarse).length).toBeGreaterThan(0)
    expect(finest.filter((cell) => ![2, 3, 4].some((resolution) => drawn.has(under(cell, resolution))))).toEqual([])
  })

  it("draws a big cell's edges along the great circles, not straight across the flat picture", () => {
    const cell = latLngToCell(65, 100, h3Resolution(1))
    const ring = cellRing(cell)!.map(([lon, lat]) => latLonToLocal({ lat: lat, lon: lon }))
    const corners = cellBoundaryLonLat(cell).map(([lon, lat]) => latLonToLocal({ lat, lon }))
    for (let i = 0; i < corners.length - 1; i++) {
      const middle = new Vector3().addVectors(corners[i]!, corners[i + 1]!).normalize()
      const nearest = Math.min(...ring.map((point) => point.angleTo(middle)))
      expect(nearest).toBeLessThan((0.1 * Math.PI) / 180)
    }
  })
})
