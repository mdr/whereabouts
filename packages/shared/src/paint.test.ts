import { describe, expect, it } from "vitest";
import { getHexagonEdgeLengthAvg, UNITS } from "h3-js";
import { PaintLayer, resolutionForTolerance } from "./paint";

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
