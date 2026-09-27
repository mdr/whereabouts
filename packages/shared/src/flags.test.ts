import { describe, expect, it } from "vitest";
import { cellArea, cellToLatLng, gridDisk, latLngToCell, UNITS } from "h3-js";
import flagsJson from "../flags.json" with { type: "json" };
import regionsJson from "../regions.json" with { type: "json" };
import { FLAG_AREA_PROMPT, FLAG_POINT_PROMPT, flagRound, type FlagQuestion } from "./flags.ts";
import { resolutionForTolerance } from "./paint.ts";
import type { RegionQuestion } from "./regions.ts";
import { buildDistribution, scoreDistribution } from "./scoring.ts";

const FLAGS = flagsJson as FlagQuestion[];
const REGIONS = new Map((regionsJson as RegionQuestion[]).map((q) => [q.id, q]));
const flag = (code: string) => FLAGS.find((f) => f.flag === code)!;

describe("flag questions", () => {
  it("are one per country, well formed", () => {
    expect(FLAGS.length).toBeGreaterThan(190);
    expect(new Set(FLAGS.map((f) => f.flag)).size).toBe(FLAGS.length);
    expect(new Set(FLAGS.map((f) => f.id)).size).toBe(FLAGS.length);
    for (const f of FLAGS) {
      expect(f.flag).toMatch(/^[a-z]{2}$/);
      expect(f.label.length, f.id).toBeGreaterThan(0);
      expect(f.wiki.length, f.id).toBeGreaterThan(0);
      if (f.regionId) expect(REGIONS.has(f.regionId), f.id).toBe(true);
      else expect(f.toleranceKm, f.id).toBeGreaterThanOrEqual(15);
    }
  });

  it("paints big countries whole and asks small, disputed and far-flung ones as a point", () => {
    for (const code of ["de", "br", "ca", "au", "ie", "lb"]) expect(flag(code).regionId, code).toBeDefined();
    for (const code of ["va", "mc", "sg", "lu", "mt", "ki", "bs", "in", "cn", "ru", "us", "ua", "cy"])
      expect(flag(code).regionId, code).toBeUndefined();
  });

  it("ask a region with the flag in place of the name, or a point", () => {
    const de = flagRound(flag("de"), REGIONS)!;
    expect(de).toMatchObject({ kind: "region", id: "germany-region", prompt: FLAG_AREA_PROMPT, flag: "de" });
    expect(de.prompt).not.toMatch(/Germany/);
    const mc = flagRound(flag("mc"), REGIONS)!;
    expect(mc).toMatchObject({ kind: "text", prompt: FLAG_POINT_PROMPT, flag: "mc", label: "Monaco" });
    expect(mc.toleranceKm).toBe(15);
  });

  it("score a tight paint on a point country's answer highly, and a far one low", () => {
    for (const code of ["lu", "sg", "va", "in"]) {
      const f = flag(code);
      const res = resolutionForTolerance(f.toleranceKm);
      const blob = (lat: number, lon: number) =>
        buildDistribution(
          gridDisk(latLngToCell(lat, lon, res), 2).map((h) => {
            const [la, lo] = cellToLatLng(h);
            return { lat: la, lon: lo, intensity: 1, areaKm2: cellArea(h, UNITS.km2), h3: h };
          }),
          0.05,
        );
      expect(scoreDistribution(blob(f.answer.lat, f.answer.lon), f.answer, f.toleranceKm).score, code).toBeGreaterThan(
        900,
      );
      expect(
        scoreDistribution(blob(-f.answer.lat, f.answer.lon + 180), f.answer, f.toleranceKm).score,
        code,
      ).toBeLessThan(320);
    }
  });
});
