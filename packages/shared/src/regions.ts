/**
 * Region questions: "Paint the whole of Germany". The answer is the country
 * itself, an outline from Natural Earth (see scripts/build-regions.mjs).
 * Practice only for now. The outlines live in regions.json, which the client
 * loads on demand rather than bundling.
 *
 * The score is max(shape, NEARNESS_WEIGHT x nearness):
 *
 * - shape compares the paint with the country cell by cell, at the painting
 *   resolution: 1000 - 500 sum (p - q)^2 / a / sum q^2 / a, with p and q the
 *   paint's and the country's mass in each cell of area a. It is the kernel
 *   score in the limit of a vanishing kernel width, and proper. Putting a
 *   share P of the paint evenly on the country (the rest just outside) scores
 *   500 + 500 P; covering a fraction c of it evenly scores
 *   1000 - 500 (1/c - 1); half on the country and half elsewhere scores 750,
 *   like a 50/50 point answer. Before comparing, paint density is capped
 *   (DENSITY_CAP), and paint off the country counts as no thinner than
 *   OFF_COUNTRY_FLOOR of the country's own even coat, so wrong paint spread
 *   thinly is not taken for vagueness.
 * - nearness is the kernel score (scoreRegion) under one wide Gaussian, 16
 *   tolerances across. A paint that misses the country has a shape score
 *   near 0 whether it is next door or on another continent; nearness is
 *   what puts a neighbour above a far country.
 *
 * Kernel widths of about the tolerance were tried for the shape and dropped:
 * they blur the country's edge, and a paint spilling well outside it fills
 * exactly the blur, so a paint with half its mass off the country still
 * scored 850 to 900. Taking the maximum of two proper scores is not proper,
 * but it only lifts misses, towards their nearness.
 */
import { cellArea, cellToChildren, cellToParent, getResolution, polygonToCells, UNITS } from "h3-js";
import type { LatLon } from "./geo.ts";
import { resolutionForTolerance } from "./paint.ts";
import {
  coarsenDistribution,
  regionAnswer,
  scoreRegion,
  type Distribution,
  type Kernel,
  type RegionAnswer,
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
  /** A flag round: the flag shown in place of the name (see flags.ts). */
  flag?: string;
}

/**
 * Paint density is capped at this multiple of the median painted density
 * (by area) before a country is scored. Strokes overlap: a second pass down
 * the middle of Mexico doubled the density there, and against an even coat
 * that cost about 90 points of an otherwise near-perfect answer. A country
 * is uniform, so painting part of it again says nothing; the cap trims such
 * hot spots and leaves an even paint alone. Lighter paint, a hedge on a
 * second guess say, stays below the cap and keeps its weight.
 */
export const DENSITY_CAP = 1.5;

/**
 * Paint off the country counts in the shape score as at least this
 * concentrated, relative to an even coat of the country itself, however
 * thinly it is spread. Without it, spreading wrong paint thinly earned the
 * credit the score gives vagueness: a big faint blob in North America scored
 * 444 for Madagascar, and an even paint of the whole world about 500. With
 * it they score about 274 and 297, just above a pass. Paint on the country,
 * and paint off it that is already concentrated (bloating the border, a
 * 50/50 hedge, a confident miss), are unaffected.
 */
export const OFF_COUNTRY_FLOOR = 0.5;

/** How much of its nearness score a paint that misses the country keeps. */
export const NEARNESS_WEIGHT = 0.55;

/** The nearness kernel: one Gaussian, 16 tolerances wide. */
export const NEARNESS_KERNEL: Kernel = { id: "nearness", label: "Nearness (16r)", scales: [16], weights: [1] };

export interface RegionQuestionScore {
  score: number;
  /** Cell-by-cell comparison with the country. */
  shape: number;
  /** Wide kernel score, before NEARNESS_WEIGHT. */
  nearness: number;
}

/**
 * Nearness is scored one H3 resolution coarser than painting, with cells up
 * to half the tolerance across: far finer than its 16-tolerance kernel, and
 * much faster.
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

/** The kernel-scoring answer for a question, cached per kernel. */
export function regionAnswerFor(q: RegionQuestion, k: Kernel = NEARNESS_KERNEL): RegionAnswer {
  const key = `${q.id}|${k.id}`;
  let a = answers.get(key);
  if (!a) {
    a = regionAnswer(regionCells(q, regionScoringRes(q.toleranceKm)), q.toleranceKm, k);
    answers.set(key, a);
  }
  return a;
}

export function scoreRegionQuestion(painted: Distribution, q: RegionQuestion): RegionQuestionScore {
  const dist = capDensity(painted);
  const shape = shapeScore(paintMass(dist, q), q);
  const coarse = coarsenDistribution(dist, regionScoringRes(q.toleranceKm));
  const nearness = scoreRegion(coarse, regionAnswerFor(q)).score;
  return { score: Math.max(shape, NEARNESS_WEIGHT * nearness), shape, nearness };
}

/**
 * How the paint sits against the country, shown on the reveal to explain the
 * score (it does not feed into it). Precision: the share of the paint
 * (leaving out the world floor) that is on the country. Coverage: the share
 * of the country that got at least half its fair share of that paint, the
 * density it would have spread evenly over the whole country, with partial
 * credit below; so an exact paint covers all of it, and so does a 50/50
 * hedge with another place.
 */
export function regionFit(paint: Distribution, q: RegionQuestion): { coverage: number; precision: number } {
  const dist = capDensity(paint);
  const painted = 1 - dist.floor;
  const region = regionAt(q);
  let onMass = 0;
  const on: { p: number; area: number }[] = [];
  for (const [h, p] of paintMass(dist, q)) {
    const area = region.cells.get(h);
    if (area === undefined) continue;
    on.push({ p, area });
    onMass += p;
  }
  if (painted <= 0 || onMass <= 0) return { coverage: 0, precision: 0 };
  const half = onMass / region.area / 2;
  let covered = 0;
  for (const c of on) covered += Math.min(1, c.p / c.area / half) * c.area;
  return { coverage: covered / region.area, precision: onMass / painted };
}

/**
 * The paint with each cell's density capped at DENSITY_CAP times the median
 * density (area-weighted, so mixed resolutions count fairly), renormalised to
 * the same painted mass.
 */
export function capDensity(dist: Distribution): Distribution {
  const cells = dist.points.map((pt) => {
    const area = pt.cell ? cellArea(pt.cell, UNITS.km2) : 1;
    return { pt, area, density: pt.p / area };
  });
  if (cells.length === 0) return dist;
  const byDensity = [...cells].sort((a, b) => a.density - b.density);
  const half = byDensity.reduce((s, c) => s + c.area, 0) / 2;
  let acc = 0;
  let median = byDensity.at(-1)!.density;
  for (const c of byDensity) {
    acc += c.area;
    if (acc >= half) {
      median = c.density;
      break;
    }
  }
  const cap = DENSITY_CAP * median;
  const capped = cells.map((c) => Math.min(c.density, cap) * c.area);
  const total = capped.reduce((s, m) => s + m, 0);
  const painted = 1 - dist.floor;
  return { floor: dist.floor, points: cells.map((c, i) => ({ ...c.pt, p: (capped[i]! / total) * painted })) };
}

interface Region {
  /** The country's cells at the painting resolution, with their areas. */
  cells: Map<string, number>;
  area: number;
  /** Their ancestors at each coarser resolution, filled in as needed. */
  ancestors: Map<number, Set<string>>;
}

const regions = new Map<string, Region>();

/** The country's cells at the painting resolution, with their areas. */
function regionAt(q: RegionQuestion): Region {
  let region = regions.get(q.id);
  if (!region) {
    const cells = new Map<string, number>();
    let area = 0;
    for (const h of regionCells(q, resolutionForTolerance(q.toleranceKm))) {
      const a = cellArea(h, UNITS.km2);
      cells.set(h, a);
      area += a;
    }
    region = { cells, area, ancestors: new Map() };
    regions.set(q.id, region);
  }
  return region;
}

/** Whether a cell coarser than the painting resolution overlaps the country. */
function overlaps(region: Region, h: string, r: number): boolean {
  let set = region.ancestors.get(r);
  if (!set) {
    set = new Set([...region.cells.keys()].map((c) => cellToParent(c, r)));
    region.ancestors.set(r, set);
  }
  return set.has(h);
}

/**
 * The paint's mass per cell at the painting resolution: finer cells merged
 * into their parents, coarser ones (a big brush) over the country shared
 * among their children by area. Coarser cells off the country stay whole:
 * every score here sums p^2 / a over off-country cells, which an even split
 * leaves unchanged, and splitting a world painted at world zoom would mean
 * millions of cells. The world floor is left out.
 */
function paintMass(dist: Distribution, q: RegionQuestion): Map<string, number> {
  const res = resolutionForTolerance(q.toleranceKm);
  const region = regionAt(q);
  const mass = new Map<string, number>();
  const add = (h: string, p: number) => mass.set(h, (mass.get(h) ?? 0) + p);
  for (const pt of dist.points) {
    if (!pt.cell) continue;
    const r = getResolution(pt.cell);
    if (r >= res) add(r === res ? pt.cell : cellToParent(pt.cell, res), pt.p);
    else if (!overlaps(region, pt.cell, r)) add(pt.cell, pt.p);
    else {
      const children = cellToChildren(pt.cell, res);
      const areas = children.map((c) => cellArea(c, UNITS.km2));
      const total = areas.reduce((a, b) => a + b, 0);
      children.forEach((c, i) => add(c, (pt.p * areas[i]!) / total));
    }
  }
  return mass;
}

/**
 * 1000 - 500 sum (p - q)^2 / a / sum q^2 / a over cells, clamped at 0. With q
 * spread evenly by area, q = a / A in each of the country's cells (A its
 * area), so sum q^2 / a = 1 / A.
 */
function shapeScore(mass: Map<string, number>, q: RegionQuestion): number {
  const region = regionAt(q);
  let sum = 0;
  for (const [h, a] of region.cells) {
    const diff = (mass.get(h) ?? 0) - a / region.area;
    sum += (diff * diff) / a;
  }
  let off = 0;
  let offMass = 0;
  for (const [h, p] of mass) {
    if (region.cells.has(h)) continue;
    off += (p * p) / cellArea(h, UNITS.km2);
    offMass += p;
  }
  sum += Math.max(off, (OFF_COUNTRY_FLOOR * offMass * offMass) / region.area);
  return Math.max(0, 1000 - 500 * sum * region.area);
}
