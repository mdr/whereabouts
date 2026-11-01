import { describe, expect, it } from "vite-plus/test"
import { h3Res } from "../h3.ts"
import { cellsOutline } from "./cell-outline.ts"
import { PaintLayer } from "./paint.ts"

describe("cellsOutline", () => {
  it("keeps a footprint on the antimeridian compact instead of spanning the world", () => {
    const layer = new PaintLayer(h3Res(4))
    for (const radius of [50, 400, 1500]) {
      for (const lon of [179.9, -179.9, 180]) {
        const outline = cellsOutline(layer.stampCells({ lat: -30, lon }, radius))
        for (const ring of outline.coordinates.flat()) {
          const lons = ring.map(([x]) => x ?? 0)
          expect(Math.max(...lons) - Math.min(...lons)).toBeLessThan(180)
        }
      }
    }
  })
})
