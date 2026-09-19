import { describe, expect, it } from "vitest";
import * as h3 from "h3-js";
import { toXyz, EARTH_RADIUS_KM } from "./geo.ts";
import {
  KERNELS,
  kernelById,
  buildDistribution,
  kernel,
  pairSum,
  scoreDistribution,
  scoreFromParts,
  selfSimilarity,
  similarityToAnswer,
  uniformKernelMean,
  type Distribution,
} from "./scoring.ts";

const r = 100;
const answer = { lat: 27.175, lon: 78.042 }; // Taj Mahal

/** Point `km` kilometres due north of `from` (small-distance approximation is fine here). */
function north(from: { lat: number; lon: number }, km: number) {
  return { lat: from.lat + (km / (Math.PI * EARTH_RADIUS_KM)) * 180, lon: from.lon };
}

function pointMass(locs: { lat: number; lon: number; p: number }[]): Distribution {
  return { points: locs.map((l) => ({ xyz: toXyz(l), p: l.p })), floor: 0 };
}

describe("kernel", () => {
  it("is 1 at zero distance, 0.5 at r, 0.0625 at 2r", () => {
    expect(kernel(0, r)).toBe(1);
    expect(kernel(r, r)).toBeCloseTo(0.5, 12);
    expect(kernel(2 * r, r)).toBeCloseTo(0.0625, 12);
  });
});

describe("example outcomes from the design note", () => {
  const cases: [string, number, number][] = [
    ["exact hit", 0, 1000],
    ["half a tolerance away", 0.5, 841],
    ["one tolerance away", 1, 500],
    ["two tolerances away", 2, 63],
    ["far away", 50, 0],
  ];
  for (const [name, tol, expected] of cases) {
    it(`100% ${name} scores ~${expected}`, () => {
      const d = pointMass([{ ...north(answer, tol * r), p: 1 }]);
      const { score } = scoreDistribution(d, answer, r);
      expect(Math.round(score)).toBe(expected);
    });
  }

  const far = north(answer, 40 * r);
  it("50/50 between two far-apart places, either correct: 750", () => {
    const d = pointMass([
      { ...answer, p: 0.5 },
      { ...far, p: 0.5 },
    ]);
    expect(Math.round(scoreDistribution(d, answer, r).score)).toBe(750);
    expect(Math.round(scoreDistribution(d, far, r).score)).toBe(750);
  });
  it("80/20, favoured correct: 960; other correct: 360", () => {
    const d = pointMass([
      { ...answer, p: 0.8 },
      { ...far, p: 0.2 },
    ]);
    expect(Math.round(scoreDistribution(d, answer, r).score)).toBe(960);
    expect(Math.round(scoreDistribution(d, far, r).score)).toBe(360);
  });
});

describe("uniform floor", () => {
  it("closed-form kernel mean matches Monte Carlo on the sphere", () => {
    // Deterministic pseudo-random sampling
    let seed = 12345;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const tol = 2000; // large tolerance so Monte Carlo converges quickly
    const y = toXyz(answer);
    let sum = 0;
    const n = 200_000;
    for (let i = 0; i < n; i++) {
      const z = 2 * rnd() - 1;
      const phi = 2 * Math.PI * rnd();
      const s = Math.sqrt(1 - z * z);
      const x: [number, number, number] = [
        EARTH_RADIUS_KM * s * Math.cos(phi),
        EARTH_RADIUS_KM * s * Math.sin(phi),
        EARTH_RADIUS_KM * z,
      ];
      const dx = x[0] - y[0],
        dy = x[1] - y[1],
        dz = x[2] - y[2];
      sum += kernel(Math.sqrt(dx * dx + dy * dy + dz * dz), tol);
    }
    expect(sum / n).toBeCloseTo(uniformKernelMean(tol), 2);
  });

  it("a fully diffuse guess scores ~500 for small tolerance", () => {
    const d: Distribution = { points: [], floor: 1 };
    const { score } = scoreDistribution(d, answer, r);
    expect(score).toBeGreaterThan(499);
    expect(score).toBeLessThan(501);
  });

  it("10% floor is cheap insurance", () => {
    const hit = buildDistribution([{ ...answer, intensity: 1, areaKm2: 1 }], 0.1);
    const miss = buildDistribution([{ ...north(answer, 5000), intensity: 1, areaKm2: 1 }], 0.1);
    expect(Math.round(scoreDistribution(hit, answer, r).score)).toBe(995);
    expect(Math.round(scoreDistribution(miss, answer, r).score)).toBe(95);
  });
});

describe("pair sum", () => {
  it("truncated grid-hash sum matches the exact O(n^2) sum", () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    // Two clusters plus scattered noise
    const pts = [];
    for (let i = 0; i < 400; i++) {
      pts.push({ lat: 27 + rnd() * 3, lon: 78 + rnd() * 3, intensity: rnd(), areaKm2: 1 });
      pts.push({ lat: 28.6 + rnd() * 0.5, lon: 77.2 + rnd() * 0.5, intensity: rnd() * 2, areaKm2: 1 });
      pts.push({ lat: rnd() * 160 - 80, lon: rnd() * 360 - 180, intensity: rnd() * 0.1, areaKm2: 1 });
    }
    const d = buildDistribution(pts, 0);
    const fast = pairSum(d.points, r);
    const exact = pairSum(d.points, r, true);
    expect(Math.abs(fast - exact)).toBeLessThan(1e-4);
  });
});

describe("bounds", () => {
  it("score stays within [0, 1000] for a mixed distribution", () => {
    const d = buildDistribution(
      [
        { lat: 27.2, lon: 78.0, intensity: 3, areaKm2: 1 },
        { lat: 51.5, lon: -0.1, intensity: 1, areaKm2: 1 },
        { lat: -33.9, lon: 151.2, intensity: 0.5, areaKm2: 1 },
      ],
      0.05,
    );
    for (const y of [answer, { lat: 51.5, lon: -0.1 }, { lat: 0, lon: 0 }]) {
      const { score, A, B } = scoreDistribution(d, y, r);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1000);
      expect(scoreFromParts(A, B)).toBe(score);
    }
  });

  it("B does not depend on the answer", () => {
    const d = buildDistribution([{ lat: 10, lon: 10, intensity: 1, areaKm2: 1 }], 0.2);
    expect(selfSimilarity(d, r)).toBe(selfSimilarity(d, r));
    expect(similarityToAnswer(d, toXyz({ lat: 10, lon: 10 }), r)).toBeGreaterThan(0.79);
  });
});

describe("mixture kernels", () => {
  const multi = kernelById("multi-equal");
  const petra = { lat: 30.3285, lon: 35.4444 };
  const tol = 200;

  it("weights sum to one and an exact hit still scores 1000", () => {
    for (const k of KERNELS) {
      expect(k.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      const d = pointMass([{ ...petra, p: 1 }]);
      expect(scoreDistribution(d, petra, tol, k).score).toBeCloseTo(1000, 6);
    }
  });

  /** Uniform disc of `radiusKm` around `centre`, as a distribution. */
  function disc(centre: { lat: number; lon: number }, radiusKm: number): Distribution {
    const pts = [];
    const step = radiusKm / 12;
    for (let dx = -radiusKm; dx <= radiusKm; dx += step) {
      for (let dy = -radiusKm; dy <= radiusKm; dy += step) {
        if (dx * dx + dy * dy > radiusKm * radiusKm) continue;
        const lat = centre.lat + (dy / (Math.PI * EARTH_RADIUS_KM)) * 180;
        const lon = centre.lon + (dx / (Math.PI * EARTH_RADIUS_KM * Math.cos((centre.lat * Math.PI) / 180))) * 180;
        pts.push({ lat, lon, intensity: 1, areaKm2: 1 });
      }
    }
    return buildDistribution(pts, 0.05);
  }

  it("a broad regional blob four tolerances off: ~0 under single, partial credit under the mixture", () => {
    const blob = disc(north(petra, 800), 500);
    const single = scoreDistribution(blob, petra, tol).score;
    const mixed = scoreDistribution(blob, petra, tol, multi).score;
    expect(single).toBeLessThan(520);
    expect(mixed).toBeGreaterThan(600);
    expect(mixed).toBeLessThan(800);
  });

  it("a confident point four tolerances off scores below a diffuse guess under both kernels", () => {
    const d = pointMass([{ ...north(petra, 800), p: 1 }]);
    const diffuse: Distribution = { points: [], floor: 1 };
    for (const k of KERNELS) {
      expect(scoreDistribution(d, petra, tol, k).score).toBeLessThan(scoreDistribution(diffuse, petra, tol, k).score);
    }
  });

  it("ranks regional blob above diffuse above the same blob on the wrong continent", () => {
    const regional = disc(north(petra, 800), 500);
    const peru = disc({ lat: -13, lon: -72 }, 500);
    const diffuse: Distribution = { points: [], floor: 1 };
    const sR = scoreDistribution(regional, petra, tol, multi).score;
    const sP = scoreDistribution(peru, petra, tol, multi).score;
    const sD = scoreDistribution(diffuse, petra, tol, multi).score;
    expect(sR).toBeGreaterThan(sD);
    expect(sD).toBeGreaterThan(sP);
    expect(sD).toBeGreaterThan(495);
    expect(sD).toBeLessThan(540);
  });

  it("aggregated pair sum matches the exact sum for coarse components", () => {
    let seed = 99;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const pts = [];
    for (let i = 0; i < 600; i++) {
      pts.push({ lat: 30 + rnd() * 6, lon: 35 + rnd() * 6, intensity: rnd(), areaKm2: 1 });
      pts.push({ lat: rnd() * 120 - 60, lon: rnd() * 360 - 180, intensity: rnd() * 0.2, areaKm2: 1 });
    }
    const d = buildDistribution(pts, 0);
    for (const k of KERNELS) {
      const fast = pairSum(d.points, tol, false, k);
      const exact = pairSum(d.points, tol, true, k);
      expect(Math.abs(fast - exact)).toBeLessThan(2e-3);
    }
  });
});

describe("patch-aware kernel", () => {
  const { cellToChildren, latLngToCell } = h3;

  function cellDistribution(cells: string[], floor = 0): Distribution {
    return buildDistribution(
      cells.map((h) => {
        const [lat, lon] = h3.cellToLatLng(h);
        return { lat, lon, intensity: 1, areaKm2: h3.cellArea(h, h3.UNITS.km2), h3: h };
      }),
      floor,
    );
  }

  it("scores one coarse cell like its children, at every kernel", () => {
    // A res-3 cell (~120 km across) scored against a 30 km tolerance. As a
    // point mass it would be hundreds of points off; as a patch A matches to
    // three decimals thanks to refinement near the answer, and B is within
    // about 0.03 (a Gaussian has a denser core than a flat hexagon, which
    // shows when the kernel is a few times narrower than the cell).
    const parent = latLngToCell(48.8, 2.3, 3);
    const children = cellToChildren(parent, 5);
    const tol = 30;
    for (const k of KERNELS) {
      for (const ans of [
        { lat: 48.8, lon: 2.3 },
        { lat: 49.3, lon: 2.9 },
        { lat: 47.5, lon: 1.0 },
      ]) {
        const coarse = scoreDistribution(cellDistribution([parent]), ans, tol, k);
        const fine = scoreDistribution(cellDistribution(children), ans, tol, k);
        expect(Math.abs(coarse.A - fine.A)).toBeLessThan(0.002);
        expect(Math.abs(coarse.B - fine.B)).toBeLessThan(0.035);
        expect(Math.abs(coarse.score - fine.score)).toBeLessThan(20);
      }
    }
  });

  it("a patch is less self-similar than a point mass of the same weight", () => {
    const parent = latLngToCell(48.8, 2.3, 3);
    const patch = cellDistribution([parent]);
    const point: Distribution = { points: [{ xyz: patch.points[0]!.xyz, p: 1 }], floor: 0 };
    expect(selfSimilarity(patch, 30)).toBeLessThan(selfSimilarity(point, 30));
    expect(selfSimilarity(point, 30)).toBeCloseTo(1, 9);
  });

  it("truncated pair sum matches the exact sum with mixed patch sizes", () => {
    const coarse = cellToChildren(latLngToCell(30, 35, 2), 3);
    const fine = cellToChildren(latLngToCell(30.5, 35.5, 4), 6);
    const d = cellDistribution([...coarse, ...fine]);
    for (const k of KERNELS) {
      const fast = pairSum(d.points, 40, false, k);
      const exact = pairSum(d.points, 40, true, k);
      expect(Math.abs(fast - exact)).toBeLessThan(3e-3);
    }
  });

  it("fine cells are barely affected by the patch correction", () => {
    const cells = h3.gridDisk(latLngToCell(27.175, 78.042, 7), 6); // ~1.2 km cells, 100 km tolerance
    const asPatches = cellDistribution(cells);
    const asPoints: Distribution = { points: asPatches.points.map((p) => ({ xyz: p.xyz, p: p.p })), floor: 0 };
    const a = scoreDistribution(asPatches, answer, r);
    const b = scoreDistribution(asPoints, answer, r);
    expect(Math.abs(a.score - b.score)).toBeLessThan(1);
  });
});
