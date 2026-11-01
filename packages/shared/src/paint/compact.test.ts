import { describe, expect, it } from "vite-plus/test"
import { cellArea, cellEntries, cellToParent, getResolution, gridDisk, h3Resolution, latLngToCell } from "../h3.ts"
import { compactRecord } from "./compact.ts"
import { PaintLayer } from "./paint.ts"

describe("compactRecord", () => {
  const totalMass = (record: Record<string, number>): number =>
    [...PaintLayer.fromRecord(h3Resolution(15), record).toCells()].reduce(
      (sum, cell) => sum + cell.intensity * cell.area,
      0
    )

  it("leaves small records alone", () => {
    const layer = new PaintLayer(h3Resolution(4))
    layer.stamp({ lat: 20, lon: 10 }, 300, 1)
    const record = layer.toRecord()
    expect(compactRecord(record, 6000)).toBe(record)
  })

  /** A disc of fine cells at one resolution, as a zoomed-in player would paint. */
  const fineDisc = (resolution: number, rings: number): Record<string, number> => {
    const record: Record<string, number> = {}
    for (const cell of gridDisk(latLngToCell(51.5, -0.1, h3Resolution(resolution)), rings)) record[cell] = 1
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
    const rebuilt = PaintLayer.fromRecord(h3Resolution(7), small)
    expect(rebuilt.cells.size).toBe(after)
    expect(totalMass(small)).toBeCloseTo(totalMass(record), 6)
    for (const cell of Object.keys(small)) expect(cell.length).toBe(15)
  })

  it("with mixed resolutions, coarsens only the finest, keeps coarser cells and adds into a parent already there", () => {
    const fine = fineDisc(7, 15)
    const london = latLngToCell(51.5, -0.1, h3Resolution(7))
    const parent = cellToParent(london, h3Resolution(6))
    const paris = latLngToCell(48.86, 2.35, h3Resolution(5))
    const record = { ...fine, [parent]: 0.5, [paris]: 2 }
    const small = compactRecord(record, 500)
    expect(Object.keys(small).length).toBeLessThanOrEqual(500)
    expect(totalMass(small)).toBeCloseTo(totalMass(record), 6)
    expect(small[paris]).toBe(2)
    expect(cellEntries(small).every(([cell]) => getResolution(cell) <= 6)).toBe(true)
    // Its seven children, painted 1, merge into the 0.5 already on it.
    const children = cellEntries(fine).filter(([cell]) => cellToParent(cell, h3Resolution(6)) === parent)
    expect(children).toHaveLength(7)
    const childMass = children.reduce((sum, [cell]) => sum + cellArea(cell), 0)
    expect(small[parent]).toBeCloseTo(0.5 + childMass / cellArea(parent), 9)
  })

  it("scores almost identically before and after compaction", async () => {
    const { buildDistribution, scoreDistribution } = await import("../scoring/scoring.ts")
    const layer = PaintLayer.fromRecord(h3Resolution(7), fineDisc(7, 15))
    const answer = { lat: 51.6, lon: 0.2 }
    const full = scoreDistribution(buildDistribution(layer.toCells(), 0.05), answer, 3)
    const compact = PaintLayer.fromRecord(h3Resolution(7), compactRecord(layer.toRecord(), 500))
    const small = scoreDistribution(buildDistribution(compact.toCells(), 0.05), answer, 3)
    expect(Math.abs(full.score - small.score)).toBeLessThan(15)
  })
})
