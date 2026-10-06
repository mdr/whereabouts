/**
 * A score in words, for the reveal: what the paint risked and where it went
 * wrong, so a player can see why it scored what it did.
 *
 * A place's score is 500 (1 + 2A - B), and only A depends on where the
 * answer is. So 1000 - score splits exactly into two costs, each at least 0:
 * the spread (1000 less the best this paint could score, had the answer been
 * where it is strongest) and the distance (that best less the score).
 */
import { cellToLatLng, getResolution } from "h3-js";
import { chordDistance, fromXyz, greatCircleDistance, toXyz, type LatLon } from "./geo.ts";
import {
  coarsenDistribution,
  DEFAULT_KERNEL,
  scoreFromParts,
  similarityToAnswer,
  type Distribution,
  type Kernel,
} from "./scoring.ts";
import type { RegionMisfit } from "./regions.ts";

export interface PointExplanation {
  /** What this paint would have scored had the answer been where it is strongest. */
  best: number;
  /** Where that is. */
  spot: LatLon;
  /** From there to the answer. */
  km: number;
  /** The share of the paint, the world floor left out, within NEAR tolerances of the answer. */
  nearShare: number;
}

/** Candidate spots are tried on the paint merged to about this many cells, then the best few exactly. */
const SEARCH_CELLS = 300;
const NEAR = 4;

export function explainPoint(
  dist: Distribution,
  answer: LatLon,
  toleranceKm: number,
  A: number,
  B: number,
  k: Kernel = DEFAULT_KERNEL,
): PointExplanation {
  let coarse = dist;
  let res = Math.max(0, ...dist.points.map((pt) => (pt.cell ? getResolution(pt.cell) : 0)));
  while (coarse.points.length > SEARCH_CELLS && res > 0) coarse = coarsenDistribution(dist, --res);
  // Without cells, A treats each as a patch rather than refining it: fast, and close enough to rank spots.
  const patches: Distribution = { points: coarse.points.map(({ cell: _, ...pt }) => pt), floor: dist.floor };
  const ranked = coarse.points
    .map((pt) => ({ pt, A: similarityToAnswer(patches, pt.xyz, toleranceKm, k) }))
    .sort((a, b) => b.A - a.A)
    .slice(0, 3);

  let bestA = A;
  let spot = answer;
  for (const { pt } of ranked) {
    const a = similarityToAnswer(dist, pt.xyz, toleranceKm, k);
    if (a <= bestA) continue;
    bestA = a;
    spot = pt.cell ? latLngOf(pt.cell) : fromXyz(pt.xyz);
  }

  const y = toXyz(answer);
  let near = 0;
  for (const pt of dist.points) if (chordDistance(pt.xyz, y) <= NEAR * toleranceKm) near += pt.p;
  const painted = 1 - dist.floor;
  return {
    best: scoreFromParts(bestA, B),
    spot,
    km: greatCircleDistance(spot, answer),
    nearShare: painted > 0 ? near / painted : 0,
  };
}

function latLngOf(h: string): LatLon {
  const [lat, lon] = cellToLatLng(h);
  return { lat, lon };
}

/** Some paint near the answer, but most of it somewhere else, and that cost something. */
export function isHedge(e: PointExplanation, score: number, toleranceKm: number): boolean {
  return Math.max(e.best, score) - score >= 25 && e.nearShare >= 0.15 && e.km > NEAR * toleranceKm;
}

/** A short, plain sentence: how near the paint was, and how spread out. */
export function describePoint(e: PointExplanation, score: number, toleranceKm: number): string {
  const best = Math.max(e.best, score);
  const distance = best - score;
  const spread = 1000 - best;
  if (isHedge(e, score, toleranceKm)) {
    return "Some of your paint was on it, but most was somewhere else.";
  }
  const where =
    distance < 25 ? "Right area" : distance < 150 ? "Close" : distance < 400 ? "Some way off" : "A long way off";
  if (spread < 60) return distance < 25 ? "Spot on." : distance < 150 ? "Close, but slightly off." : `${where}.`;
  const how = spread < 200 ? "a bit spread out" : "very spread out";
  return `${where}, ${distance < 150 ? "but" : "and"} ${how}.`;
}

/** Shares of the paint or the country below this are not worth a mention. */
const MENTION = 0.1;

/** What kept a country round's paint from matching the country, biggest first. */
export function describeRegion(m: RegionMisfit, label: string, toleranceKm: number): string {
  // A country's tolerance is a fifth of its equivalent radius.
  const radiusKm = 5 * toleranceKm;
  if (m.precision < MENTION) {
    if (!m.off) return `Your paint was around ${label}, but not on it.`;
    const how = m.off.km < radiusKm ? "just" : m.off.km < 4 * radiusKm ? "well" : "a long way";
    return `Your paint was ${how} ${compass(m.off.bearing)} of ${label}.`;
  }
  const offShare = 1 - m.precision;
  const bareShare = 1 - m.coverage;
  const parts: [number, string][] = [];
  if (offShare >= MENTION) {
    const where = !m.off
      ? "went over the border all round"
      : m.off.km < radiusKm
        ? `went over the ${compass(m.off.bearing)} border`
        : `was well to the ${compass(m.off.bearing)}`;
    parts.push([offShare, `${amount(offShare)} your paint ${where}.`]);
  }
  if (bareShare >= MENTION) {
    const what = m.bare ? `the ${compass(m.bare.bearing)}` : label;
    parts.push([bareShare, `You missed ${amount(bareShare).toLowerCase()} ${what}.`]);
  }
  if (parts.length === 0) return "A good match.";
  return parts
    .sort((a, b) => b[0] - a[0])
    .map(([, s]) => s)
    .join(" ");
}

function amount(share: number): string {
  return share < 0.25 ? "Some of" : share < 0.6 ? "A lot of" : "Most of";
}

const POINTS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

function compass(deg: number): string {
  return POINTS[Math.round(deg / 45) % 8]!;
}
