import { describe, expect, it } from "vitest";
import { cellArea, cellToChildren, cellToLatLng, getRes0Cells, gridDisk, latLngToCell, UNITS } from "h3-js";
import regionsJson from "../regions.json" with { type: "json" };
import { resolutionForTolerance } from "./paint.ts";
import { QUESTIONS } from "./questions.ts";
import {
  SHAPE_WEIGHT,
  regionCells,
  regionFit,
  regionScoringRes,
  scoreRegionQuestion,
  type RegionQuestion,
} from "./regions.ts";
import { buildDistribution, coarsenDistribution, scoreDistribution, type Distribution } from "./scoring.ts";

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
    // A spread of shapes and sizes: big, small, long, in two parts, and
    // islands. All 150 take too long for CI; pnpm calibrate paints every one.
    const sample = [
      "germany-region",
      "canada-region",
      "indonesia-region",
      "chile-region",
      "norway-region",
      "malaysia-region",
      "the-gambia-region",
      "lebanon-region",
      "solomon-islands-region",
      "new-zealand-region",
    ].map(byId);
    for (const q of sample) {
      const { score } = scoreRegionQuestion(paintRegion(q), q);
      expect(score, q.label).toBeGreaterThan(985);
    }
  });

  it("ranks the right country above a neighbour above one of its size far away", () => {
    const germany = byId("germany-region");
    const exact = scoreRegionQuestion(paintRegion(germany), germany).score;
    const poland = scoreRegionQuestion(paintRegion(byId("poland-region")), germany).score;
    const japan = scoreRegionQuestion(paintRegion(byId("japan-region")), germany).score;
    // A far bigger country, painted thinly: spreading wrong paint thinly is still wrong.
    const brazil = scoreRegionQuestion(paintRegion(byId("brazil-region")), germany).score;
    expect(exact).toBeGreaterThan(poland);
    expect(poland).toBeGreaterThan(250); // a near miss still beats a pass
    expect(poland).toBeLessThan(800);
    expect(japan).toBeLessThan(250); // a confident wrong answer is worse than passing
    expect(brazil).toBeGreaterThan(japan);
    expect(brazil).toBeLessThan(500);
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
  const poland = regionCells(byId("poland-region"), res);
  const area = (cs: string[]) => cs.reduce((s, h) => s + cellArea(h, UNITS.km2), 0);
  const score = (d: Distribution) => scoreRegionQuestion(d, germany).score;

  /** Each part's share of the paint, spread evenly over its cells. */
  const shares = (parts: [string[], number][]) => {
    const density = new Map<string, number>();
    for (const [cs, share] of parts) {
      const d = share / area(cs);
      for (const h of cs) density.set(h, (density.get(h) ?? 0) + d);
    }
    return buildDistribution(
      [...density].map(([h, intensity]) => {
        const [lat, lon] = cellToLatLng(h);
        return { lat, lon, intensity, areaKm2: cellArea(h, UNITS.km2), h3: h };
      }),
      0.05,
    );
  };
  /** Germany grown ring by ring until it covers `times` its area. */
  const grown = (times: number) => {
    const set = new Set(cells);
    let frontier = cells;
    while (area([...set]) < times * area(cells)) {
      const next: string[] = [];
      for (const h of frontier) {
        for (const n of gridDisk(h, 1)) {
          if (set.has(n)) continue;
          next.push(n);
          set.add(n);
        }
      }
      frontier = next;
    }
    return [...set];
  };

  it("adds the two up: SHAPE_WEIGHT of shape, the rest nearness", () => {
    const s = scoreRegionQuestion(coat(poland), germany);
    expect(s.score).toBeCloseTo(SHAPE_WEIGHT * s.shape + (1 - SHAPE_WEIGHT) * s.nearness, 9);
  });

  it("spilling half the paint just past the border scores about 850", () => {
    const s = score(coat(grown(2)));
    expect(s).toBeGreaterThan(800);
    expect(s).toBeLessThan(890);
  });

  it("covering half the country scores about 750", () => {
    const s = score(coat(cells.filter((h) => cellToLatLng(h)[1] < germany.answer.lon)));
    expect(s).toBeGreaterThan(710);
    expect(s).toBeLessThan(830);
  });

  it("half on the country and half on a far one of its size scores about 750, like a 50/50 point answer", () => {
    const s = score(
      shares([
        [cells, 0.5],
        [regionCells(byId("japan-region"), res), 0.5],
      ]),
    );
    expect(s).toBeGreaterThan(700);
    expect(s).toBeLessThan(790);
  });

  it("a neighbour scores about half, and a hedge with it more the more paint is on the country", () => {
    const only = score(coat(poland));
    expect(only).toBeGreaterThan(400);
    expect(only).toBeLessThan(550);
    const hedges = [0.2, 0.5, 0.8].map((w) =>
      score(
        shares([
          [cells, w],
          [poland, 1 - w],
        ]),
      ),
    );
    expect(hedges[0]).toBeGreaterThan(only);
    expect(hedges[0]).toBeLessThan(620);
    expect(hedges[1]).toBeGreaterThan(hedges[0]! + 150);
    expect(hedges[2]).toBeGreaterThan(hedges[1]! + 100);
    expect(hedges[2]).toBeGreaterThan(940);
  });

  it("a faint wash around the country costs more the heavier it is", () => {
    const inside = new Set(cells);
    const ring = grown(4).filter((h) => !inside.has(h));
    const washed = (x: number) =>
      score(
        shares([
          [cells, area(cells)],
          [ring, x * area(ring)],
        ]),
      );
    expect(washed(0.1)).toBeGreaterThan(920);
    expect(washed(0.5)).toBeGreaterThan(740);
    expect(washed(0.5)).toBeLessThan(washed(0.1) - 120);
  });

  it("wrong paint spread thinly does not pass for vagueness", () => {
    // A faint blob eight times Germany's area, centred in North America.
    const blob = gridDisk(latLngToCell(40, -100, res - 1), 22);
    expect(area(blob)).toBeGreaterThan(6 * area(cells));
    expect(score(coat(blob))).toBeLessThan(250);
    // The whole world painted evenly: just above a pass.
    const world = getRes0Cells().flatMap((c) => cellToChildren(c, 2));
    const w = score(coat(world));
    expect(w).toBeGreaterThan(250);
    expect(w).toBeLessThan(350);
  });

  it("uneven brushing costs little", () => {
    // A band through the middle third, painted twice.
    const lats = cells.map((h) => cellToLatLng(h)[0]).sort((a, b) => a - b);
    const lo = lats[Math.floor(lats.length / 3)]!;
    const hi = lats[Math.floor((2 * lats.length) / 3)]!;
    const band = cells.filter((h) => cellToLatLng(h)[0] >= lo && cellToLatLng(h)[0] < hi);
    expect(
      score(
        shares([
          [cells, area(cells)],
          [band, area(band)],
        ]),
      ),
    ).toBeGreaterThan(950);
    // A bright middle fading to half density at the edges.
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
    expect(score(uneven)).toBeGreaterThan(950);
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
