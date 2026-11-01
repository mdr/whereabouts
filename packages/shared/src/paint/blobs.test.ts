import { describe, expect, it } from "vite-plus/test"
import { h3Resolution } from "../h3.ts"
import { paintBlobs } from "./blobs.ts"
import { PaintLayer, resolutionForTolerance } from "./paint.ts"

describe("paintBlobs", () => {
  it("reports no blobs for an empty layer", () => {
    expect(paintBlobs(new PaintLayer(resolutionForTolerance(100)))).toEqual([])
  })

  it("reports blobs with fractions summing to one", () => {
    const layer = new PaintLayer(resolutionForTolerance(100))
    layer.stamp({ lat: 27, lon: 78 }, 60, 1)
    layer.stamp({ lat: 51.5, lon: -0.1 }, 60, 0.5)
    const blobs = paintBlobs(layer)
    expect(blobs.length).toBe(2)
    expect(blobs[0]!.fraction + blobs[1]!.fraction).toBeCloseTo(1, 9)
    expect(blobs[0]!.fraction).toBeGreaterThan(blobs[1]!.fraction)
    expect(blobs[0]!.centroid.lat).toBeCloseTo(27, 0)
  })

  it("blobs still sum to one when fine and coarse cells overlap", () => {
    const layer = new PaintLayer(h3Resolution(8))
    layer.stamp({ lat: 27, lon: 78 }, 800, 1) // coarse
    layer.stamp({ lat: 27, lon: 78 }, 3, 1) // fine, on top
    layer.stamp({ lat: -30, lon: 140 }, 3, 1) // fine, elsewhere
    const blobs = paintBlobs(layer)
    expect(blobs.reduce((sum, blob) => sum + blob.fraction, 0)).toBeCloseTo(1, 9)
    expect(blobs.length).toBe(2)
    expect(layer.resolutionCounts().length).toBe(2)
  })
})
