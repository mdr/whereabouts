/**
 * Region questions: "Paint the whole of Germany". The answer is the country
 * itself, an outline from Natural Earth (see scripts/build-regions.mjs), and
 * the paint is scored against it with scoreRegion under REGION_KERNEL.
 * Practice only for now. The outlines live in regions.json, which the client
 * loads on demand rather than bundling.
 */
import { cellArea, polygonToCells, UNITS } from "h3-js";
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

export function scoreRegionQuestion(dist: Distribution, q: RegionQuestion, k: Kernel = REGION_KERNEL): RegionScore {
  return scoreRegion(coarsenDistribution(dist, regionScoringRes(q.toleranceKm)), regionAnswerFor(q, k));
}

/**
 * How the paint sits against the region, for explaining a score (neither
 * number feeds into it). Coverage: the share of the region that got at least
 * its fair share of paint, the density an exact paint would have. Precision:
 * the share of the paint (leaving out the world floor) that is on the region.
 */
export function regionFit(dist: Distribution, q: RegionQuestion): { coverage: number; precision: number } {
  const res = regionScoringRes(q.toleranceKm);
  const cells = new Set(regionCells(q, res));
  let regionArea = 0;
  for (const h of cells) regionArea += cellArea(h, UNITS.km2);
  const painted = 1 - dist.floor;
  if (painted <= 0 || regionArea <= 0) return { coverage: 0, precision: 0 };
  const fair = painted / regionArea;
  let on = 0;
  let covered = 0;
  for (const pt of coarsenDistribution(dist, res).points) {
    if (!pt.cell || !cells.has(pt.cell)) continue;
    on += pt.p;
    const area = cellArea(pt.cell, UNITS.km2);
    covered += Math.min(1, pt.p / area / fair) * area;
  }
  return { coverage: covered / regionArea, precision: on / painted };
}
