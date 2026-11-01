import { describe, expect, it } from "vite-plus/test"
import { cellToLatLng, edgeLength, h3Res, latLngToCell } from "../h3.ts"
import { greatCircleDistance } from "../geo.ts"
import { PaintLayer, cellSpacing, resolutionForTolerance } from "./paint.ts"

describe("resolutionForTolerance", () => {
  it("picks cells with edge at most a quarter of the tolerance", () => {
    for (const tolerance of [2, 3, 15, 50, 150, 400, 2000]) {
      const res = resolutionForTolerance(tolerance)
      expect(edgeLength(res)).toBeLessThanOrEqual(tolerance / 4)
      if (res > 1) expect(edgeLength(h3Res(res - 1))).toBeGreaterThan(tolerance / 4)
    }
  })
})

describe("PaintLayer", () => {
  it("stamps a soft disc and erases it again", () => {
    const layer = new PaintLayer(resolutionForTolerance(100))
    const stamped = layer.stamp({ lat: 27, lon: 78 }, 60, 1)
    expect(stamped.res).toBe(layer.res)
    expect(layer.cells.size).toBeGreaterThan(10)
    expect(layer.maxIntensity()).toBeCloseTo(1, 6)
    layer.stamp({ lat: 27, lon: 78 }, 60, -1)
    expect(layer.isEmpty).toBe(true)
  })

  it("picks a coarser resolution for a big brush, so the cell count stays bounded at any zoom", () => {
    const layer = new PaintLayer(h3Res(9)) // ~0.2 km cells, as a 1 km tolerance would use
    for (const radius of [0.5, 5, 50, 500, 3000]) {
      const fresh = new PaintLayer(h3Res(9))
      const stamped = fresh.stamp({ lat: 51.5, lon: -0.1 }, radius, 1)
      expect(stamped.res).toBeLessThanOrEqual(9)
      // Between 5 and 13 rings depending on where the radius falls between H3 steps.
      expect(fresh.size).toBeLessThan(600)
      expect(fresh.size).toBeGreaterThan(0)
    }
    // A brush the size of a continent uses very coarse cells; a tiny one the finest.
    expect(layer.stampResolution(3000)).toBeLessThanOrEqual(2)
    expect(layer.stampResolution(0.5)).toBe(9)
  })

  it("a brush smaller than half a cell at the finest resolution paints exactly one cell", () => {
    const layer = new PaintLayer(h3Res(5))
    const spacing = cellSpacing(h3Res(5))
    const tiny = 0.3 * spacing
    expect(layer.stampPlan(tiny)).toEqual({ res: 5, rings: 0 })
    expect(layer.stampCells({ lat: 51.5, lon: -0.1 }, tiny)).toEqual([latLngToCell(51.5, -0.1, h3Res(5))])
    const r = layer.stamp({ lat: 51.5, lon: -0.1 }, tiny, 1)
    expect(r.cells).toBe(1)
    expect(layer.size).toBe(1)
    expect(layer.maxIntensity()).toBeCloseTo(1, 6)
    // And erasing with the same tiny brush takes it away again.
    layer.stamp({ lat: 51.5, lon: -0.1 }, tiny, -1)
    expect(layer.isEmpty).toBe(true)
    // Just over half a cell is the familiar seven-cell stamp.
    expect(layer.stampPlan(0.6 * spacing).rings).toBe(1)
  })

  it("erasing with a small brush inside a coarse cell removes only the part under the brush", () => {
    const layer = new PaintLayer(h3Res(9))
    const brush = { lat: 51.5, lon: -0.1 }
    layer.stamp(brush, 400, 1) // coarse cells, ~res 3
    const before = layer.mass()
    const coarseRes = Math.min(...layer.resolutionCounts().map(([r]) => r))
    expect(coarseRes).toBeLessThan(6)
    const far = [...layer.cells].filter(([cell]) => {
      const [lat, lon] = cellToLatLng(cell)
      return greatCircleDistance(brush, { lat, lon }) > 100
    })
    expect(far.length).toBeGreaterThan(0)
    layer.erase(brush, 5, 10) // hard erase, 5 km brush
    const after = layer.mass()
    expect(after).toBeLessThan(before)
    // Removed mass is on the order of the erase footprint, not the coarse cell.
    expect(before - after).toBeLessThan(0.02 * before)
    // Splitting refined only near the brush: the layer is still small.
    expect(layer.size).toBeLessThan(600)
    // Far from the brush the paint is untouched.
    for (const [cell, value] of far) expect(layer.cells.get(cell), cell).toBe(value)
  })

  it("erasing everything under a brush of the same size clears it", () => {
    const layer = new PaintLayer(h3Res(7))
    layer.stamp({ lat: 27, lon: 78 }, 100, 1)
    layer.erase({ lat: 27, lon: 78 }, 100, 1)
    expect(layer.isEmpty).toBe(true)
  })

  it("splitting a cell conserves mass exactly", () => {
    const layer = new PaintLayer(h3Res(9))
    layer.stamp({ lat: 40, lon: -3 }, 300, 1)
    const before = layer.mass()
    // A zero-strength erase still refines the straddling cells.
    layer.erase({ lat: 40, lon: -3 }, 5, 0)
    // H3 children areas sum to the parent's to within geodesic rounding.
    expect(Math.abs(layer.mass() - before) / before).toBeLessThan(1e-6)
  })
})

describe("mixed resolutions", () => {
  it("draws coarse cells before fine ones", () => {
    const layer = new PaintLayer(h3Res(8))
    layer.stamp({ lat: 27, lon: 78 }, 3, 1)
    layer.stamp({ lat: 27, lon: 78 }, 800, 1)
    const fc = layer.toGeoJSON()
    const sizes = fc.features.map((feature) => {
      const ring = feature.geometry.coordinates[0]!
      return Math.abs(ring[0]![0]! - ring[3]![0]!)
    })
    // Sizes never increase after the first decrease.
    let decreased = false
    for (let i = 1; i < sizes.length; i++) {
      if (sizes[i]! < sizes[i - 1]! * 0.5) decreased = true
      if (decreased) expect(sizes[i]!).toBeLessThan(sizes[0]! * 0.5)
    }
    expect(decreased).toBe(true)
  })
})
