import { describe, expect, it } from "vitest";
import { cellArea, cellToLatLng, gridDisk, latLngToCell, UNITS } from "h3-js";
import regionsJson from "../regions.json" with { type: "json" };
import { describePoint, describeRegion, explainPoint } from "./explain.ts";
import { resolutionForTolerance } from "./paint.ts";
import { regionCells, regionMisfit, scoreRegionQuestion, type RegionQuestion } from "./regions.ts";
import { buildDistribution, scoreDistribution } from "./scoring.ts";

const coat = (cells: string[]) =>
  buildDistribution(
    cells.map((h) => {
      const [lat, lon] = cellToLatLng(h);
      return { lat, lon, intensity: 1, areaKm2: cellArea(h, UNITS.km2), h3: h };
    }),
    0.05,
  );

describe("explaining a place's score", () => {
  const answer = { lat: 48.8584, lon: 2.2945 };
  const tol = 150;
  const res = resolutionForTolerance(tol);
  const explain = (lat: number, lon: number, r: number, k: number) => {
    const d = coat(gridDisk(latLngToCell(lat, lon, r), k));
    const s = scoreDistribution(d, answer, tol);
    const e = explainPoint(d, answer, tol, s.A, s.B);
    return { s, e, text: describePoint(e, s.score, tol) };
  };

  it("a tight guess on the answer costs nothing worth mentioning", () => {
    const { s, e, text } = explain(answer.lat, answer.lon, res, 1);
    expect(e.best - s.score).toBeLessThan(25);
    expect(text).toBe("Tight, and right on the answer.");
  });

  it("a tight miss keeps its best score and charges the distance", () => {
    const { s, e, text } = explain(answer.lat + 2.7, answer.lon, res, 1);
    expect(e.best).toBeGreaterThan(930);
    expect(e.km).toBeGreaterThan(250);
    expect(e.km).toBeLessThan(350);
    expect(text).toBe(
      `The answer was 300 km from the heart of your paint: −${Math.round(e.best) - Math.round(s.score)}.`,
    );
  });

  it("a broad guess on the answer is charged for the spread alone", () => {
    const { e, text } = explain(answer.lat, answer.lon, res - 2, 6);
    expect(e.best).toBeLessThan(780);
    expect(text).toBe(`Your paint was centred on the answer. Spreading it cost ${1000 - Math.round(e.best)}.`);
  });
});

describe("explaining a country's score", () => {
  const regions = regionsJson as RegionQuestion[];
  const byId = (id: string) => regions.find((q) => q.id === id)!;
  const france = byId("france-region");
  const res = resolutionForTolerance(france.toleranceKm);
  const cells = regionCells(france, res);
  const say = (cs: string[]) => describeRegion(regionMisfit(coat(cs), france), france.label, france.toleranceKm);

  it("an exact paint is a close match", () => {
    expect(scoreRegionQuestion(coat(cells), france).score).toBeGreaterThan(985);
    expect(say(cells)).toBe(`A close match to ${france.label}.`);
  });

  it("names the side left bare", () => {
    expect(say(cells.filter((h) => cellToLatLng(h)[1] < france.answer.lon))).toMatch(/mostly in the east\.$/);
  });

  it("names the border paint spilled over, and a neighbour painted instead", () => {
    const germany = regionCells(byId("germany-region"), res);
    expect(say([...cells, ...germany])).toMatch(/spilled over its north-east border/);
    expect(say(germany)).toBe(`Your paint was just north-east of ${france.label}.`);
  });
});
