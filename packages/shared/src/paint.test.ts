import { describe, expect, it } from "vitest";
import { getHexagonEdgeLengthAvg, getResolution, gridDisk, latLngToCell, UNITS } from "h3-js";
import { PaintLayer, cellSpacingKm, compactRecord, resolutionForTolerance } from "./paint.ts";

describe("resolutionForTolerance", () => {
  it("picks cells with edge at most a quarter of the tolerance", () => {
    for (const tol of [2, 3, 15, 50, 150, 400, 2000]) {
      const res = resolutionForTolerance(tol);
      expect(getHexagonEdgeLengthAvg(res, UNITS.km)).toBeLessThanOrEqual(tol / 4);
      if (res > 1) expect(getHexagonEdgeLengthAvg(res - 1, UNITS.km)).toBeGreaterThan(tol / 4);
    }
  });
});

describe("PaintLayer", () => {
  it("stamps a soft disc and erases it again", () => {
    const layer = new PaintLayer(resolutionForTolerance(100));
    const r = layer.stamp({ lat: 27, lon: 78 }, 60, 1);
    expect(r.res).toBe(layer.res);
    expect(layer.cells.size).toBeGreaterThan(10);
    expect(layer.maxIntensity()).toBeCloseTo(1, 6);
    layer.stamp({ lat: 27, lon: 78 }, 60, -1);
    expect(layer.isEmpty).toBe(true);
  });

  it("picks a coarser resolution for a big brush, so the cell count stays bounded at any zoom", () => {
    const layer = new PaintLayer(9); // ~0.2 km cells, as a 1 km tolerance would use
    for (const radiusKm of [0.5, 5, 50, 500, 3000]) {
      const fresh = new PaintLayer(9);
      const r = fresh.stamp({ lat: 51.5, lon: -0.1 }, radiusKm, 1);
      expect(r.res).toBeLessThanOrEqual(9);
      // Between 5 and 13 rings depending on where the radius falls between H3 steps.
      expect(fresh.size).toBeLessThan(600);
      expect(fresh.size).toBeGreaterThan(0);
    }
    // A brush the size of a continent uses very coarse cells; a tiny one the finest.
    expect(layer.stampResolution(3000)).toBeLessThanOrEqual(2);
    expect(layer.stampResolution(0.5)).toBe(9);
  });

  it("a brush smaller than half a cell at the finest resolution paints exactly one cell", () => {
    const layer = new PaintLayer(5);
    const spacing = cellSpacingKm(5);
    const tiny = 0.3 * spacing;
    expect(layer.stampPlan(tiny)).toEqual({ res: 5, rings: 0 });
    expect(layer.stampCells({ lat: 51.5, lon: -0.1 }, tiny)).toEqual([latLngToCell(51.5, -0.1, 5)]);
    const r = layer.stamp({ lat: 51.5, lon: -0.1 }, tiny, 1);
    expect(r.cells).toBe(1);
    expect(layer.size).toBe(1);
    expect(layer.maxIntensity()).toBeCloseTo(1, 6);
    // And erasing with the same tiny brush takes it away again.
    layer.stamp({ lat: 51.5, lon: -0.1 }, tiny, -1);
    expect(layer.isEmpty).toBe(true);
    // Just over half a cell is the familiar seven-cell stamp.
    expect(layer.stampPlan(0.6 * spacing).rings).toBe(1);
  });

  it("erasing with a small brush inside a coarse cell removes only the part under the brush", () => {
    const layer = new PaintLayer(9);
    layer.stamp({ lat: 51.5, lon: -0.1 }, 400, 1); // coarse cells, ~res 3
    const before = layer.mass();
    const coarseRes = Math.min(...layer.resolutionCounts().map(([r]) => r));
    expect(coarseRes).toBeLessThan(6);
    layer.erase({ lat: 51.5, lon: -0.1 }, 5, 10); // hard erase, 5 km brush
    const after = layer.mass();
    expect(after).toBeLessThan(before);
    // Removed mass is on the order of the erase footprint, not the coarse cell.
    expect(before - after).toBeLessThan(0.02 * before);
    // Splitting refined only near the brush: the layer is still small.
    expect(layer.size).toBeLessThan(600);
    // Far from the brush the paint is untouched.
    const farCell = [...layer.cells.keys()].find((h) => getResolution(h) === coarseRes);
    expect(farCell).toBeDefined();
  });

  it("erasing everything under a brush of the same size clears it", () => {
    const layer = new PaintLayer(7);
    layer.stamp({ lat: 27, lon: 78 }, 100, 1);
    layer.erase({ lat: 27, lon: 78 }, 100, 1);
    expect(layer.isEmpty).toBe(true);
  });

  it("splitting a cell conserves mass exactly", () => {
    const layer = new PaintLayer(9);
    layer.stamp({ lat: 40, lon: -3 }, 300, 1);
    const before = layer.mass();
    // A zero-strength erase still refines the straddling cells.
    layer.erase({ lat: 40, lon: -3 }, 5, 0);
    // H3 children areas sum to the parent's to within geodesic rounding.
    expect(Math.abs(layer.mass() - before) / before).toBeLessThan(1e-6);
  });

  it("reports blobs with fractions summing to one", () => {
    const layer = new PaintLayer(resolutionForTolerance(100));
    layer.stamp({ lat: 27, lon: 78 }, 60, 1);
    layer.stamp({ lat: 51.5, lon: -0.1 }, 60, 0.5);
    const blobs = layer.blobs();
    expect(blobs.length).toBe(2);
    expect(blobs[0]!.fraction + blobs[1]!.fraction).toBeCloseTo(1, 9);
    expect(blobs[0]!.fraction).toBeGreaterThan(blobs[1]!.fraction);
    expect(blobs[0]!.centroid.lat).toBeCloseTo(27, 0);
  });
});

describe("compactRecord", () => {
  function totalMass(rec: Record<string, number>): number {
    return [...PaintLayer.fromRecord(15, rec).toCells()].reduce((s, c) => s + c.intensity * c.areaKm2, 0);
  }

  it("leaves small records alone", () => {
    const layer = new PaintLayer(4);
    layer.stamp({ lat: 20, lon: 10 }, 300, 1);
    const rec = layer.toRecord();
    expect(compactRecord(rec, 6000)).toBe(rec);
  });

  /** A disc of fine cells at one resolution, as a zoomed-in player would paint. */
  function fineDisc(res: number, rings: number): Record<string, number> {
    const rec: Record<string, number> = {};
    for (const h of gridDisk(latLngToCell(51.5, -0.1, res), rings)) rec[h] = 1;
    return rec;
  }

  it("coarsens to fit the budget while conserving mass and staying at or coarser than the origin", () => {
    const rec = fineDisc(7, 15); // fine cells, as a 3 km tolerance would use
    const before = Object.keys(rec).length;
    expect(before).toBeGreaterThan(500);
    const small = compactRecord(rec, 500);
    const after = Object.keys(small).length;
    expect(after).toBeLessThanOrEqual(500);
    expect(after).toBeGreaterThan(0);
    const rebuilt = PaintLayer.fromRecord(7, small);
    expect(rebuilt.cells.size).toBe(after);
    expect(totalMass(small)).toBeCloseTo(totalMass(rec), 6);
    for (const h of Object.keys(small)) expect(h.length).toBe(15);
  });

  it("scores almost identically before and after compaction", async () => {
    const { buildDistribution, scoreDistribution } = await import("./scoring.ts");
    const layer = PaintLayer.fromRecord(7, fineDisc(7, 15));
    const answer = { lat: 51.6, lon: 0.2 };
    const full = scoreDistribution(buildDistribution(layer.toCells(), 0.05), answer, 3);
    const compact = PaintLayer.fromRecord(7, compactRecord(layer.toRecord(), 500));
    const small = scoreDistribution(buildDistribution(compact.toCells(), 0.05), answer, 3);
    expect(Math.abs(full.score - small.score)).toBeLessThan(15);
  });
});

describe("mixed resolutions", () => {
  it("blobs still sum to one when fine and coarse cells overlap", () => {
    const layer = new PaintLayer(8);
    layer.stamp({ lat: 27, lon: 78 }, 800, 1); // coarse
    layer.stamp({ lat: 27, lon: 78 }, 3, 1); // fine, on top
    layer.stamp({ lat: -30, lon: 140 }, 3, 1); // fine, elsewhere
    const blobs = layer.blobs();
    expect(blobs.reduce((s, b) => s + b.fraction, 0)).toBeCloseTo(1, 9);
    expect(blobs.length).toBe(2);
    expect(layer.resolutionCounts().length).toBe(2);
  });

  it("draws coarse cells before fine ones", () => {
    const layer = new PaintLayer(8);
    layer.stamp({ lat: 27, lon: 78 }, 3, 1);
    layer.stamp({ lat: 27, lon: 78 }, 800, 1);
    const fc = layer.toGeoJSON();
    const sizes = fc.features.map((f) => {
      const ring = f.geometry.coordinates[0]!;
      return Math.abs(ring[0]![0]! - ring[3]![0]!);
    });
    // Sizes never increase after the first decrease.
    let decreased = false;
    for (let i = 1; i < sizes.length; i++) {
      if (sizes[i]! < sizes[i - 1]! * 0.5) decreased = true;
      if (decreased) expect(sizes[i]!).toBeLessThan(sizes[0]! * 0.5);
    }
  });
});
