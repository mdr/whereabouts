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

/** Costs below this are not worth a mention. */
const NEGLIGIBLE = 25;

/** One or two sentences: what the distance cost, and what spreading the paint cost. */
export function describePoint(e: PointExplanation, score: number, toleranceKm: number): string {
  const best = Math.round(Math.max(e.best, score));
  const distance = best - Math.round(score);
  const spread = 1000 - best;
  if (distance < NEGLIGIBLE && spread < NEGLIGIBLE) return "Tight, and right on the answer.";
  const where =
    distance < NEGLIGIBLE
      ? "Your paint was centred on the answer."
      : e.nearShare >= 0.15 && e.km > NEAR * toleranceKm
        ? `${pct(e.nearShare)} of your paint was near the answer, but most was ${roughKm(e.km)} away: −${distance}.`
        : `The answer was ${roughKm(e.km)} from the heart of your paint: −${distance}.`;
  return spread < NEGLIGIBLE ? where : `${where} Spreading it cost ${spread}.`;
}

/** Shares of the paint or the country below this are not worth a mention. */
const MENTION = 0.1;

/** What kept a country round's paint from matching the country, biggest first. */
export function describeRegion(m: RegionMisfit, label: string, toleranceKm: number): string {
  // A country's tolerance is a fifth of its equivalent radius.
  const radiusKm = 5 * toleranceKm;
  if (m.precision < MENTION) {
    if (!m.off) return `Hardly any of your paint was on ${label}.`;
    return m.off.km < radiusKm
      ? `Your paint was just ${compass(m.off.bearing)} of ${label}.`
      : `Your paint was ${roughKm(m.off.km)} ${compass(m.off.bearing)} of ${label}.`;
  }
  const offShare = 1 - m.precision;
  const bareShare = 1 - m.coverage;
  const parts: [number, string][] = [];
  if (offShare >= MENTION) {
    const where = !m.off
      ? "spilled all round it"
      : m.off.km < radiusKm
        ? `spilled over its ${compass(m.off.bearing)} border`
        : `${roughKm(m.off.km)} ${compass(m.off.bearing)} of it`;
    parts.push([offShare, `${pct(offShare)} of your paint was off ${label}: ${where}.`]);
  }
  if (bareShare >= MENTION) {
    const where = m.bare ? `, mostly in the ${compass(m.bare.bearing)}` : "";
    parts.push([bareShare, `${pct(bareShare)} of ${label} was bare or thinly painted${where}.`]);
  }
  if (parts.length === 0) return `A close match to ${label}.`;
  return parts
    .sort((a, b) => b[0] - a[0])
    .map(([, s]) => s)
    .join(" ");
}

const POINTS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

function compass(deg: number): string {
  return POINTS[Math.round(deg / 45) % 8]!;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Two significant figures: the explanation is qualitative. */
function roughKm(km: number): string {
  if (km < 10) return `${Math.max(1, Math.round(km))} km`;
  const step = 10 ** (Math.floor(Math.log10(km)) - 1);
  return `${(Math.round(km / step) * step).toLocaleString("en")} km`;
}
