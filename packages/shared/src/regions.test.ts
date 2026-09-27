import { describe, expect, it } from "vitest";
import { cellArea, cellToLatLng, UNITS } from "h3-js";
import regionsJson from "../regions.json" with { type: "json" };
import { resolutionForTolerance } from "./paint.ts";
import { QUESTIONS } from "./questions.ts";
import {
  regionAnswerFor,
  regionCells,
  regionFit,
  regionScoringRes,
  scoreRegionQuestion,
  type RegionQuestion,
} from "./regions.ts";
import { buildDistribution, coarsenDistribution, scoreDistribution, scoreRegion } from "./scoring.ts";

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
      expect(q.toleranceKm).toBeGreaterThanOrEqual(20);
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
    // A far bigger country painted thinly is nearly as vague as the whole world.
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

describe("the coverage factor", () => {
  const germany = byId("germany-region");
  const res = resolutionForTolerance(germany.toleranceKm);
  /** The kernel rule on its own, without the factor. */
  const raw = (d: ReturnType<typeof coat>) =>
    scoreRegion(coarsenDistribution(d, regionScoringRes(germany.toleranceKm)), regionAnswerFor(germany)).score;

  it("scales down paint that covers only part of the country", () => {
    // The western half of Germany: west of its centre, by longitude.
    const west = coat(regionCells(germany, res).filter((h) => cellToLatLng(h)[1] < germany.answer.lon));
    const { coverage, precision } = regionFit(west, germany);
    expect(coverage).toBeGreaterThan(0.4);
    expect(coverage).toBeLessThan(0.65);
    const expected = raw(west) * (1 - precision * (1 - Math.sqrt(coverage)));
    expect(scoreRegionQuestion(west, germany).score).toBeCloseTo(expected, 6);
    expect(scoreRegionQuestion(west, germany).score).toBeLessThan(raw(west) * 0.85);
  });

  it("leaves a paint that misses the country alone", () => {
    // Poland shares a few coarse border cells with Germany, so it moves a point at most.
    const poland = coat(regionCells(byId("poland-region"), res));
    expect(scoreRegionQuestion(poland, germany).score).toBeGreaterThan(raw(poland) - 2);
    expect(scoreRegionQuestion(coat(regionCells(byId("japan-region"), res)), germany).score).toBeCloseTo(
      raw(coat(regionCells(byId("japan-region"), res))),
      6,
    );
    expect(scoreRegionQuestion({ points: [], floor: 1 }, germany).score).toBeCloseTo(raw({ points: [], floor: 1 }), 6);
  });

  it("does not punish an even hedge between the country and a neighbour", () => {
    const hedge = coat([...regionCells(germany, res), ...regionCells(byId("poland-region"), res)]);
    expect(scoreRegionQuestion(hedge, germany).score).toBeGreaterThan(raw(hedge) * 0.98);
  });
});

describe("coarsenDistribution", () => {
  it("keeps the mass and barely moves a point question's score", () => {
    const answer = { lat: 48.8584, lon: 2.2945 };
    const d = coat(regionCells(byId("france-region"), 6));
    const coarse = coarsenDistribution(d, 5);
    const mass = (x: typeof d) => x.points.reduce((s, p) => s + p.p, 0) + x.floor;
    expect(mass(coarse)).toBeCloseTo(1, 9);
    expect(coarse.points.length).toBeLessThan(d.points.length / 4);
    for (const tol of [60, 150]) {
      const diff = Math.abs(scoreDistribution(coarse, answer, tol).score - scoreDistribution(d, answer, tol).score);
      expect(diff).toBeLessThan(5);
    }
  });
});
