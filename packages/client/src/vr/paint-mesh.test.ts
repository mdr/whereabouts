import { describe, expect, it } from "vite-plus/test"
import { Vector3 } from "three"
import { PaintLayer, h3Res } from "@whereabouts/shared"
import { THEME } from "../themes"
import { paintGeometry } from "./paint-mesh"
import { localToLatLon } from "./sphere"

describe("paint on the VR globe", () => {
  it("is a fan of triangles on the sphere for each cell, faint to bright as the map ramps it", () => {
    const layer = new PaintLayer(h3Res(5))
    layer.stamp({ lat: 51.5, lon: -0.1 }, 40, 1)
    const paint = layer.toGeoJSON()
    const g = paintGeometry(paint, THEME, 2)
    const pos = g.getAttribute("position")
    const colour = g.getAttribute("color")
    const v = new Vector3()
    for (let i = 0; i < pos.count; i++) expect(v.fromBufferAttribute(pos, i).length()).toBeCloseTo(2, 6)
    expect(g.getIndex()!.count).toBe(
      paint.features.reduce((n, f) => n + 3 * (f.geometry.coordinates[0]!.length - 1), 0)
    )

    // Each cell's first vertex is its middle.
    let first = 0
    const alphas = paint.features.map((f) => {
      const at = localToLatLon(v.fromBufferAttribute(pos, first))
      const ring = f.geometry.coordinates[0]!.slice(0, -1)
      const lat = ring.reduce((s, [, la]) => s + la!, 0) / ring.length
      expect(at.lat).toBeCloseTo(lat, 1)
      const a = colour.getW(first)
      first += ring.length + 1
      return [f.properties.v, a] as const
    })
    const [low, high] = [alphas.reduce((m, x) => (x[0] < m[0] ? x : m)), alphas.reduce((m, x) => (x[0] > m[0] ? x : m))]
    expect(high[1]).toBeCloseTo(THEME.rampOpacity[1], 5)
    expect(low[1]).toBeLessThan(high[1])
  })

  it("keeps cells across the antimeridian whole", () => {
    const layer = new PaintLayer(h3Res(3))
    layer.stamp({ lat: 0, lon: 180 }, 100, 1)
    const g = paintGeometry(layer.toGeoJSON(), THEME, 1)
    const pos = g.getAttribute("position")
    const v = new Vector3()
    for (let i = 0; i < pos.count; i++)
      expect(Math.abs(localToLatLon(v.fromBufferAttribute(pos, i)).lon)).toBeGreaterThan(170)
  })
})
