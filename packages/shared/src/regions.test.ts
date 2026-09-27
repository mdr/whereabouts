import { describe, expect, it } from "vitest";
import { cellArea, cellToChildren, cellToLatLng, getRes0Cells, gridDisk, latLngToCell, UNITS } from "h3-js";
import regionsJson from "../regions.json" with { type: "json" };
import { resolutionForTolerance } from "./paint.ts";
import { QUESTIONS } from "./questions.ts";
import {
  NEARNESS_WEIGHT,
  capDensity,
  regionCells,
  regionFit,
  regionScoringRes,
  scoreRegionQuestion,
  type RegionQuestion,
} from "./regions.ts";
import { buildDistribution, coarsenDistribution, scoreDistribution } from "./scoring.ts";

const REGIONS = regionsJson as RegionQuestion[];
const byId = (id: string) => REGIONS.find((q) => q.id === id)!;

/** An even coat of paint over `cells`, with the usual 5% world floor. */
function coat(cells: string[], floor = 0.05) {
  return buildDistribution(
    cells.map((h) => {
      const [lat, lon] = cellToLatLng(h);
      return { lat, lon, intensity: 1, areaKm2: cellArea(h, UNITS.km2), h3: h };
    }),
    floor,
  );
}

/** Paint a region the way a player would: at the question's painting resolution. */
const paintRegion = (q: RegionQuestion) => coat(regionCells(q, resolutionForTolerance(q.toleranceKm)));

describe("region questions", () => {
  it("are well formed, with ids of their own", () => {
    const ids = new Set(QUESTIONS.map((q) => q.id));
    for (const q of REGIONS) {
      expect(ids.has(q.id), `duplicate id ${q.id}`).toBe(false);
      ids.add(q.id);
      expect(q.kind).toBe("region");
      expect(q.prompt).toMatch(/^Paint the whole of /);
      expect(q.wiki.length).toBeGreaterThan(0);
      expect(q.toleranceKm).toBeGreaterThanOrEqual(10);
      expect(q.toleranceKm).toBeLessThanOrEqual(400);
      expect(q.outline.length).toBeGreaterThan(0);
      for (const polygon of q.outline) {
        for (const ring of polygon) {
          expect(ring.length).toBeGreaterThanOrEqual(4);
          expect(ring[0]).toEqual(ring.at(-1));
        }
      }
      expect(regionCells(q, regionScoringRes(q.toleranceKm)).length, q.id).toBeGreaterThan(10);
    }
  });

  it("painting the country as it is scores close to 1000", () => {
    for (const q of REGIONS) {
      const { score } = scoreRegionQuestion(paintRegion(q), q);
      expect(score, q.label).toBeGreaterThan(985);
    }
  });

  it("ranks the right country above a neighbour above one of its size far away", () => {
    const germany = byId("germany-region");
    const exact = scoreRegionQuestion(paintRegion(germany), germany).score;
    const poland = scoreRegionQuestion(paintRegion(byId("poland-region")), germany).score;
    const japan = scoreRegionQuestion(paintRegion(byId("japan-region")), germany).score;
    // A far bigger country, painted thinly: its paint counts as no thinner than half Germany's.
    const brazil = scoreRegionQuestion(paintRegion(byId("brazil-region")), germany).score;
    expect(exact).toBeGreaterThan(poland);
    expect(poland).toBeGreaterThan(250); // a near miss still beats a pass
    expect(poland).toBeLessThan(800);
    expect(japan).toBeLessThan(250); // a confident wrong answer is worse than passing
    expect(brazil).toBeGreaterThan(japan);
    expect(brazil).toBeLessThan(500);
  });

  it("an even paint of the whole world scores about 500", () => {
    for (const id of ["germany-region", "chile-region", "brazil-region"]) {
      const { score } = scoreRegionQuestion({ points: [], floor: 1 }, byId(id));
      expect(score).toBeGreaterThan(495);
      expect(score).toBeLessThan(600);
    }
  });

  it("reports coverage and precision", () => {
    const germany = byId("germany-region");
    const exact = regionFit(paintRegion(germany), germany);
    expect(exact.coverage).toBeGreaterThan(0.95);
    expect(exact.precision).toBeGreaterThan(0.95);
    const poland = regionFit(paintRegion(byId("poland-region")), germany);
    expect(poland.precision).toBeLessThan(0.1);
    expect(poland.coverage).toBeLessThan(0.1);
    // Germany and Poland together: all of Germany covered, about half the paint on it.
    const both = regionFit(
      coat([
        ...regionCells(germany, resolutionForTolerance(germany.toleranceKm)),
        ...regionCells(byId("poland-region"), resolutionForTolerance(germany.toleranceKm)),
      ]),
      germany,
    );
    expect(both.coverage).toBeGreaterThan(0.95);
    expect(both.precision).toBeGreaterThan(0.4);
    expect(both.precision).toBeLessThan(0.6);
  });
});

describe("shape and nearness", () => {
  const germany = byId("germany-region");
  const res = resolutionForTolerance(germany.toleranceKm);
  const cells = regionCells(germany, res);
  const area = (cs: string[]) => cs.reduce((s, h) => s + cellArea(h, UNITS.km2), 0);

  it("bloating the paint until half of it is off the country scores about 750", () => {
    let bloated = cells;
    for (let rings = 1; area(bloated) < 2 * area(cells); rings++) {
      bloated = [...new Set(cells.flatMap((h) => gridDisk(h, rings)))];
    }
    const s = scoreRegionQuestion(coat(bloated), germany);
    expect(s.score).toBe(s.shape);
    expect(s.score).toBeGreaterThan(700);
    expect(s.score).toBeLessThan(790);
    expect(regionFit(coat(bloated), germany).coverage).toBeGreaterThan(0.95);
  });

  it("covering half the country scores about 500, or what nearness gives it", () => {
    const west = coat(cells.filter((h) => cellToLatLng(h)[1] < germany.answer.lon));
    const s = scoreRegionQuestion(west, germany);
    expect(s.shape).toBeGreaterThan(420);
    expect(s.shape).toBeLessThan(580);
    expect(s.score).toBeCloseTo(Math.max(s.shape, NEARNESS_WEIGHT * s.nearness), 9);
    expect(s.score).toBeLessThan(620);
  });

  it("half on the country and half on a far one of its size scores about 750, like a 50/50 point answer", () => {
    const japan = regionCells(byId("japan-region"), res);
    const s = scoreRegionQuestion(coat([...cells, ...japan]), germany);
    expect(s.score).toBeGreaterThan(720);
    expect(s.score).toBeLessThan(790);
  });

  it("a paint that misses the country scores by its nearness", () => {
    const s = scoreRegionQuestion(coat(regionCells(byId("poland-region"), res)), germany);
    expect(s.shape).toBeLessThan(50);
    expect(s.score).toBeCloseTo(NEARNESS_WEIGHT * s.nearness, 9);
  });

  /** Paint the given cells at the given intensity each. */
  const layered = (layers: [string[], number][]) => {
    const byCell = new Map<string, number>();
    for (const [cs, intensity] of layers) for (const h of cs) byCell.set(h, (byCell.get(h) ?? 0) + intensity);
    return buildDistribution(
      [...byCell].map(([h, intensity]) => {
        const [lat, lon] = cellToLatLng(h);
        return { lat, lon, intensity, areaKm2: cellArea(h, UNITS.km2), h3: h };
      }),
      0.05,
    );
  };

  it("a second coat over part of the country costs little (the density cap)", () => {
    // A band through the middle third, painted twice.
    const lats = cells.map((h) => cellToLatLng(h)[0]).sort((a, b) => a - b);
    const lo = lats[Math.floor(lats.length / 3)]!;
    const hi = lats[Math.floor((2 * lats.length) / 3)]!;
    const band = cells.filter((h) => cellToLatLng(h)[0] >= lo && cellToLatLng(h)[0] < hi);
    const twice = layered([
      [cells, 1],
      [band, 1],
    ]);
    const { shape } = scoreRegionQuestion(twice, germany);
    expect(shape).toBeGreaterThan(960);
    // Uncapped, the band would be twice as dense as the rest; capped, 1.5 times.
    const densities = capDensity(twice).points.map((pt) => pt.p / cellArea(pt.cell!, UNITS.km2));
    expect(Math.max(...densities) / Math.min(...densities)).toBeCloseTo(1.5, 1);
  });

  it("a lighter hedge on a second country keeps its weight under the cap", () => {
    const poland = regionCells(byId("poland-region"), res);
    const hedge = layered([
      [cells, 2],
      [poland, 1],
    ]);
    const on = (2 * area(cells)) / (2 * area(cells) + area(poland));
    expect(regionFit(hedge, germany).precision).toBeCloseTo(on, 2);
  });

  it("wrong paint spread thinly does not pass for vagueness (the off-country floor)", () => {
    // A faint blob eight times Germany's area, centred in North America.
    const blob = gridDisk(latLngToCell(40, -100, res - 1), 22);
    expect(area(blob)).toBeGreaterThan(6 * area(cells));
    const s = scoreRegionQuestion(coat(blob), germany);
    expect(s.score).toBeGreaterThan(230);
    expect(s.score).toBeLessThan(320);
    // The whole world painted evenly: just above a pass.
    const world = getRes0Cells().flatMap((c) => cellToChildren(c, 2));
    const w = scoreRegionQuestion(coat(world), germany);
    expect(w.score).toBeGreaterThan(250);
    expect(w.score).toBeLessThan(350);
  });

  it("uneven brushing costs little: a bright middle fading to half density at the edges", () => {
    const R = Math.sqrt(area(cells) / Math.PI);
    const uneven = buildDistribution(
      cells.map((h) => {
        const [lat, lon] = cellToLatLng(h);
        const km =
          Math.hypot(lat - germany.answer.lat, (lon - germany.answer.lon) * Math.cos((lat * Math.PI) / 180)) * 111;
        return { lat, lon, intensity: Math.max(0.5, 1.5 - km / R), areaKm2: cellArea(h, UNITS.km2), h3: h };
      }),
      0.05,
    );
    expect(scoreRegionQuestion(uneven, germany).score).toBeGreaterThan(900);
  });
});

describe("coarsenDistribution", () => {
  it("keeps the mass and barely moves a point question's score", () => {
    const answer = { lat: 48.8584, lon: 2.2945 };
    const d = coat(regionCells(byId("france-region"), 5));
    const coarse = coarsenDistribution(d, 4);
    const mass = (x: typeof d) => x.points.reduce((s, p) => s + p.p, 0) + x.floor;
    expect(mass(coarse)).toBeCloseTo(1, 9);
    expect(coarse.points.length).toBeLessThan(d.points.length / 4);
    for (const tol of [60, 150]) {
      const diff = Math.abs(scoreDistribution(coarse, answer, tol).score - scoreDistribution(d, answer, tol).score);
      expect(diff).toBeLessThan(5);
    }
  });
});
