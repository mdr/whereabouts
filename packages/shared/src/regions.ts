/**
 * Region questions: "Paint the whole of Germany". The answer is the country
 * itself, an outline from Natural Earth (see scripts/build-regions.mjs), and
 * the paint is scored against it with scoreRegion under REGION_KERNEL.
 * Practice only for now. The outlines live in regions.json, which the client
 * loads on demand rather than bundling.
 */
import { cellArea, cellToChildren, cellToParent, getResolution, polygonToCells, UNITS } from "h3-js";
import type { LatLon } from "./geo.ts";
import { resolutionForTolerance } from "./paint.ts";
import {
  REGION_KERNEL,
  coarsenDistribution,
  regionAnswer,
  scoreRegion,
  type Distribution,
  type Kernel,
  type RegionAnswer,
  type RegionScore,
} from "./scoring.ts";

export interface RegionQuestion {
  id: string;
  kind: "region";
  prompt: string;
  /** Shown after the reveal. */
  label: string;
  /** English Wikipedia article title. */
  wiki: string;
  /** Area-weighted centre, for framing the map. */
  answer: LatLon;
  /** A fifth of the country's equivalent radius, sqrt(area / pi). */
  toleranceKm: number;
  /** GeoJSON MultiPolygon coordinates: [lon, lat] rings, outer ring first. */
  outline: number[][][][];
}

/**
 * Scoring runs one H3 resolution coarser than painting, with cells up to
 * half the tolerance across. On the calibration shapes that moved scores by
 * a few points at most and made scoring 6 to 15 times faster.
 */
export function regionScoringRes(toleranceKm: number): number {
  return Math.max(0, resolutionForTolerance(toleranceKm) - 1);
}

/** The region's cells at `res`: those whose centres fall inside the outline. */
export function regionCells(q: RegionQuestion, res: number): string[] {
  const cells = new Set<string>();
  for (const polygon of q.outline) for (const h of polygonToCells(polygon, res, true)) cells.add(h);
  return [...cells];
}

const answers = new Map<string, RegionAnswer>();

/** The scoring answer for a question, cached per kernel. */
export function regionAnswerFor(q: RegionQuestion, k: Kernel = REGION_KERNEL): RegionAnswer {
  const key = `${q.id}|${k.id}`;
  let a = answers.get(key);
  if (!a) {
    a = regionAnswer(regionCells(q, regionScoringRes(q.toleranceKm)), q.toleranceKm, k);
    answers.set(key, a);
  }
  return a;
}

/**
 * Score a paint against a country: the kernel rule (scoreRegion), scaled down
 * for paint that covers only part of the country. The kernel rule alone
 * forgives that too much: its wide component sees the whole country as one
 * blob, and the narrow one blurs the edges, so two thirds of Australia still
 * scored 879. The factor is 1 - precision (1 - sqrt(coverage)): the full
 * sqrt(coverage) when all the paint is on the country, none when none is, so
 * a neighbour or a far country scores as before. Coverage is measured
 * against the paint that is on the country, so hedging between two places
 * is not punished. This bends the rule away from strictly proper, but the
 * only nudge it adds is towards covering the whole country.
 */
export function scoreRegionQuestion(dist: Distribution, q: RegionQuestion, k: Kernel = REGION_KERNEL): RegionScore {
  const coarse = coarsenDistribution(dist, regionScoringRes(q.toleranceKm));
  const raw = scoreRegion(coarse, regionAnswerFor(q, k));
  const { coverage, precision } = regionFit(dist, q);
  return { ...raw, score: raw.score * (1 - precision * (1 - Math.sqrt(coverage))) };
}

/**
 * How the paint sits against the country, as shown on the reveal and used by
 * the coverage factor. Measured at the painting resolution rather than the
 * coarser scoring one: a coarse cell counts as the country only if its centre
 * is inside, so along a coast much of an exact paint would count as off it. Precision: the share of the paint (leaving out the
 * world floor) that is on the country. Coverage: the share of the country
 * that got at least half its fair share of that paint, the density it would
 * have spread evenly over the whole country, with partial credit below; so
 * an exact paint covers all of it and a 50/50 hedge with another place
 * covers all of it too.
 */
export function regionFit(dist: Distribution, q: RegionQuestion): { coverage: number; precision: number } {
  const res = resolutionForTolerance(q.toleranceKm);
  // Paint at the fit resolution: finer cells merged into parents, coarser
  // ones (a big brush) shared among their children by area.
  const mass = new Map<string, number>();
  const add = (h: string, p: number) => mass.set(h, (mass.get(h) ?? 0) + p);
  for (const pt of dist.points) {
    if (!pt.cell) continue;
    const r = getResolution(pt.cell);
    if (r >= res) add(r === res ? pt.cell : cellToParent(pt.cell, res), pt.p);
    else {
      const children = cellToChildren(pt.cell, res);
      const areas = children.map((c) => cellArea(c, UNITS.km2));
      const total = areas.reduce((a, b) => a + b, 0);
      children.forEach((c, i) => add(c, (pt.p * areas[i]!) / total));
    }
  }
  return fitOf(mass, 1 - dist.floor, q, res);
}

const cellSets = new Map<string, { cells: Set<string>; area: number }>();

function fitOf(
  mass: Map<string, number>,
  painted: number,
  q: RegionQuestion,
  res: number,
): { coverage: number; precision: number } {
  let region = cellSets.get(q.id);
  if (!region) {
    const cells = new Set(regionCells(q, res));
    let area = 0;
    for (const h of cells) area += cellArea(h, UNITS.km2);
    region = { cells, area };
    cellSets.set(q.id, region);
  }
  if (painted <= 0 || region.area <= 0) return { coverage: 0, precision: 0 };
  const on: { p: number; area: number }[] = [];
  let onMass = 0;
  for (const [h, p] of mass) {
    if (!region.cells.has(h)) continue;
    on.push({ p, area: cellArea(h, UNITS.km2) });
    onMass += p;
  }
  if (onMass <= 0) return { coverage: 0, precision: 0 };
  const half = onMass / region.area / 2;
  let covered = 0;
  for (const c of on) covered += Math.min(1, c.p / c.area / half) * c.area;
  return { coverage: covered / region.area, precision: onMass / painted };
}
