import { describe, expect, it } from "vite-plus/test"
import { Vector3, type Mesh } from "three"
import { HintAxis, type HintBand } from "@whereabouts/shared/hints"
import type { LatLon } from "@whereabouts/shared/geo"
import { HintMarker } from "./hint"
import { localToLatLon } from "./sphere"

/** Where the band's shading lies on the globe: each of its vertices, as a latitude and longitude. */
const shadedPoints = (band: HintBand): LatLon[] => {
  const marker = new HintMarker(1)
  marker.show(band)
  const fill = marker.group.children[0] as Mesh
  const positions = fill.geometry.getAttribute("position")
  const point = new Vector3()
  return Array.from({ length: positions.count }, (_, i) => localToLatLon(point.fromBufferAttribute(positions, i)))
}

// The vertices are 32-bit floats.
const EPSILON = 1e-4

describe("HintMarker", () => {
  it("shades a latitude band between its edges, all the way round", () => {
    const points = shadedPoints({ axis: HintAxis.LATITUDE, from: 10, to: 30 })
    for (const { lat } of points) {
      expect(lat).toBeGreaterThanOrEqual(10 - EPSILON)
      expect(lat).toBeLessThanOrEqual(30 + EPSILON)
    }
    expect(Math.min(...points.map(({ lon }) => lon))).toBeCloseTo(-180, 0)
    expect(Math.max(...points.map(({ lon }) => lon))).toBeCloseTo(180, 0)
  })

  it("shades a longitude band between its edges", () => {
    const points = shadedPoints({ axis: HintAxis.LONGITUDE, from: 20, to: 50 })
    for (const { lat, lon } of points) {
      if (Math.abs(lat) > 89.9) continue // at a pole longitude means nothing
      expect(lon).toBeGreaterThanOrEqual(20 - EPSILON)
      expect(lon).toBeLessThanOrEqual(50 + EPSILON)
    }
  })

  it("shades a longitude band across 180° on both sides of it, not the rest of the world", () => {
    for (const { lat, lon } of shadedPoints({ axis: HintAxis.LONGITUDE, from: 170, to: -170 })) {
      if (Math.abs(lat) > 89.9) continue
      expect(lon >= 170 - EPSILON || lon <= -170 + EPSILON, `${lon}`).toBe(true)
    }
  })

  it("clears the band when the hint goes", () => {
    const marker = new HintMarker(1)
    marker.show({ axis: HintAxis.LATITUDE, from: 10, to: 30 })
    marker.show(undefined)
    expect(marker.group.children).toHaveLength(0)
    expect(marker.band).toBeUndefined()
  })
})
