import { describe, expect, it } from "vite-plus/test"
import {
  cellArea,
  cellEntries,
  cellToLatLng,
  cellToParent,
  edgeLength,
  getResolution,
  gridDisk,
  h3Res,
  latLngToCell
} from "../h3.ts"
import { greatCircleDistance } from "../geo.ts"
import { PaintLayer, cellSpacing, cellsOutline, compactRecord, resolutionForTolerance } from "./paint.ts"

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

  it("reports no blobs for an empty layer", () => {
    expect(new PaintLayer(resolutionForTolerance(100)).blobs()).toEqual([])
  })

  it("reports blobs with fractions summing to one", () => {
    const layer = new PaintLayer(resolutionForTolerance(100))
    layer.stamp({ lat: 27, lon: 78 }, 60, 1)
    layer.stamp({ lat: 51.5, lon: -0.1 }, 60, 0.5)
    const blobs = layer.blobs()
    expect(blobs.length).toBe(2)
    expect(blobs[0]!.fraction + blobs[1]!.fraction).toBeCloseTo(1, 9)
    expect(blobs[0]!.fraction).toBeGreaterThan(blobs[1]!.fraction)
    expect(blobs[0]!.centroid.lat).toBeCloseTo(27, 0)
  })
})

describe("compactRecord", () => {
  function totalMass(record: Record<string, number>): number {
    return [...PaintLayer.fromRecord(h3Res(15), record).toCells()].reduce(
      (sum, cell) => sum + cell.intensity * cell.area,
      0
    )
  }

  it("leaves small records alone", () => {
    const layer = new PaintLayer(h3Res(4))
    layer.stamp({ lat: 20, lon: 10 }, 300, 1)
    const record = layer.toRecord()
    expect(compactRecord(record, 6000)).toBe(record)
  })

  /** A disc of fine cells at one resolution, as a zoomed-in player would paint. */
  function fineDisc(resolution: number, rings: number): Record<string, number> {
    const record: Record<string, number> = {}
    for (const cell of gridDisk(latLngToCell(51.5, -0.1, h3Res(resolution)), rings)) record[cell] = 1
    return record
  }

  it("coarsens to fit the budget while conserving mass and staying at or coarser than the origin", () => {
    const record = fineDisc(7, 15) // fine cells, as a 3 km tolerance would use
    const before = Object.keys(record).length
    expect(before).toBeGreaterThan(500)
    const small = compactRecord(record, 500)
    const after = Object.keys(small).length
    expect(after).toBeLessThanOrEqual(500)
    expect(after).toBeGreaterThan(0)
    const rebuilt = PaintLayer.fromRecord(h3Res(7), small)
    expect(rebuilt.cells.size).toBe(after)
    expect(totalMass(small)).toBeCloseTo(totalMass(record), 6)
    for (const cell of Object.keys(small)) expect(cell.length).toBe(15)
  })

  it("with mixed resolutions, coarsens only the finest, keeps coarser cells and adds into a parent already there", () => {
    const fine = fineDisc(7, 15)
    const london = latLngToCell(51.5, -0.1, h3Res(7))
    const parent = cellToParent(london, h3Res(6))
    const paris = latLngToCell(48.86, 2.35, h3Res(5))
    const record = { ...fine, [parent]: 0.5, [paris]: 2 }
    const small = compactRecord(record, 500)
    expect(Object.keys(small).length).toBeLessThanOrEqual(500)
    expect(totalMass(small)).toBeCloseTo(totalMass(record), 6)
    expect(small[paris]).toBe(2)
    expect(cellEntries(small).every(([cell]) => getResolution(cell) <= 6)).toBe(true)
    // Its seven children, painted 1, merge into the 0.5 already on it.
    const children = cellEntries(fine).filter(([cell]) => cellToParent(cell, h3Res(6)) === parent)
    expect(children).toHaveLength(7)
    const childMass = children.reduce((sum, [cell]) => sum + cellArea(cell), 0)
    expect(small[parent]).toBeCloseTo(0.5 + childMass / cellArea(parent), 9)
  })

  it("scores almost identically before and after compaction", async () => {
    const { buildDistribution, scoreDistribution } = await import("../scoring/scoring.ts")
    const layer = PaintLayer.fromRecord(h3Res(7), fineDisc(7, 15))
    const answer = { lat: 51.6, lon: 0.2 }
    const full = scoreDistribution(buildDistribution(layer.toCells(), 0.05), answer, 3)
    const compact = PaintLayer.fromRecord(h3Res(7), compactRecord(layer.toRecord(), 500))
    const small = scoreDistribution(buildDistribution(compact.toCells(), 0.05), answer, 3)
    expect(Math.abs(full.score - small.score)).toBeLessThan(15)
  })
})

describe("mixed resolutions", () => {
  it("blobs still sum to one when fine and coarse cells overlap", () => {
    const layer = new PaintLayer(h3Res(8))
    layer.stamp({ lat: 27, lon: 78 }, 800, 1) // coarse
    layer.stamp({ lat: 27, lon: 78 }, 3, 1) // fine, on top
    layer.stamp({ lat: -30, lon: 140 }, 3, 1) // fine, elsewhere
    const blobs = layer.blobs()
    expect(blobs.reduce((sum, blob) => sum + blob.fraction, 0)).toBeCloseTo(1, 9)
    expect(blobs.length).toBe(2)
    expect(layer.resolutionCounts().length).toBe(2)
  })

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
