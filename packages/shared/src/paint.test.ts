import { describe, expect, it } from "vitest";
import { getHexagonEdgeLengthAvg, UNITS } from "h3-js";
import { PaintLayer, compactRecord, resolutionForTolerance } from "./paint.ts";

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
    expect(r.clamped).toBe(false);
    expect(layer.cells.size).toBeGreaterThan(10);
    expect(layer.maxIntensity()).toBeCloseTo(1, 6);
    layer.stamp({ lat: 27, lon: 78 }, 60, -1);
    expect(layer.isEmpty).toBe(true);
  });

  it("clamps oversized brushes", () => {
    const layer = new PaintLayer(9);
    const r = layer.stamp({ lat: 51.5, lon: -0.1 }, 500, 1);
    expect(r.clamped).toBe(true);
    expect(layer.cells.size).toBeLessThan(6000);
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

  it("coarsens to fit the budget while conserving mass and staying at or coarser than the origin", () => {
    const layer = new PaintLayer(7); // fine cells, as a 3 km tolerance would use
    for (let i = 0; i < 6; i++) layer.stamp({ lat: 51.5 + i * 0.05, lon: -0.1 + i * 0.1 }, 40, 1);
    const rec = layer.toRecord();
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
    const layer = new PaintLayer(7);
    for (let i = 0; i < 6; i++) layer.stamp({ lat: 51.5 + i * 0.05, lon: -0.1 + i * 0.1 }, 40, 1);
    const answer = { lat: 51.6, lon: 0.2 };
    const full = scoreDistribution(buildDistribution(layer.toCells(), 0.05), answer, 3);
    const compact = PaintLayer.fromRecord(7, compactRecord(layer.toRecord(), 500));
    const small = scoreDistribution(buildDistribution(compact.toCells(), 0.05), answer, 3);
    expect(Math.abs(full.score - small.score)).toBeLessThan(15);
  });
});
