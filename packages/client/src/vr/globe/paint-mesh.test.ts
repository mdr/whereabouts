import { describe, expect, it } from "vite-plus/test"
import { Vector3 } from "three"
import { PaintLayer } from "@whereabouts/shared/paint/paint"
import { h3Res } from "@whereabouts/shared/h3"
import { THEME } from "../../map/themes"
import { paintGeometry } from "./paint-mesh"
import { localToLatLon } from "./sphere"

describe("paint on the VR globe", () => {
  it("is a fan of triangles on the sphere for each cell, faint to bright as the map ramps it", () => {
    const layer = new PaintLayer(h3Res(5))
    layer.stamp({ lat: 51.5, lon: -0.1 }, 40, 1)
    const paint = layer.toGeoJSON()
    const geometry = paintGeometry(paint, THEME, 2)
    const positions = geometry.getAttribute("position")
    const colour = geometry.getAttribute("color")
    const vertex = new Vector3()
    for (let i = 0; i < positions.count; i++)
      expect(vertex.fromBufferAttribute(positions, i).length()).toBeCloseTo(2, 6)
    expect(geometry.getIndex()!.count).toBe(
      paint.features.reduce((count, feature) => count + 3 * (feature.geometry.coordinates[0]!.length - 1), 0)
    )

    // Each cell's first vertex is its middle.
    let first = 0
    const alphas = paint.features.map((feature) => {
      const at = localToLatLon(vertex.fromBufferAttribute(positions, first))
      const ring = feature.geometry.coordinates[0]!.slice(0, -1)
      const lat = ring.reduce((sum, [, latitude]) => sum + latitude!, 0) / ring.length
      expect(at.lat).toBeCloseTo(lat, 1)
      const a = colour.getW(first)
      first += ring.length + 1
      return [feature.properties.v, a] as const
    })
    const [low, high] = [
      alphas.reduce((lowest, entry) => (entry[0] < lowest[0] ? entry : lowest)),
      alphas.reduce((highest, entry) => (entry[0] > highest[0] ? entry : highest))
    ]
    expect(high[1]).toBeCloseTo(THEME.rampOpacity[1], 5)
    expect(low[1]).toBeLessThan(high[1])
  })

  it("keeps cells across the antimeridian whole", () => {
    const layer = new PaintLayer(h3Res(3))
    layer.stamp({ lat: 0, lon: 180 }, 100, 1)
    const geometry = paintGeometry(layer.toGeoJSON(), THEME, 1)
    const positions = geometry.getAttribute("position")
    const vertex = new Vector3()
    for (let i = 0; i < positions.count; i++)
      expect(Math.abs(localToLatLon(vertex.fromBufferAttribute(positions, i)).lon)).toBeGreaterThan(170)
  })
})
