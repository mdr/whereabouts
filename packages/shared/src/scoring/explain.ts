/**
 * What a place's score is made of, for the awards: what the paint risked and
 * where it went wrong.
 *
 * A place's score is 500 (1 + 2A - B), and only A depends on where the
 * answer is. So 1000 - score splits exactly into two costs, each at least 0:
 * the spread (1000 less the best this paint could score, had the answer been
 * where it is strongest) and the distance (that best less the score).
 */
import { cellToLatLng, coarserRes, getResolution, h3Res, type H3Cell } from "../h3.ts"
import { chordDistance, fromXyz, greatCircleDistance, toXyz, type LatLon } from "../geo.ts"
import type { Km } from "../units.ts"
import {
  coarsenDistribution,
  DEFAULT_KERNEL,
  scoreFromParts,
  similarityToAnswer,
  type Distribution,
  type Kernel
} from "./scoring.ts"

export interface PointExplanation {
  /** What this paint would have scored had the answer been where it is strongest. */
  best: number
  /** Where that is. */
  spot: LatLon
  /** From there to the answer. */
  miss: Km
  /** The share of the paint, the world floor left out, within NEAR tolerances of the answer. */
  nearShare: number
}

/** Candidate spots are tried on the paint merged to about this many cells, then the best few exactly. */
const SEARCH_CELLS = 300
const NEAR = 4

export function explainPoint(
  dist: Distribution,
  answer: LatLon,
  tolerance: Km,
  A: number,
  B: number,
  k: Kernel = DEFAULT_KERNEL
): PointExplanation {
  let coarse = dist
  let res = h3Res(Math.max(0, ...dist.points.map((pt) => (pt.cell ? getResolution(pt.cell) : 0))))
  while (coarse.points.length > SEARCH_CELLS && res > 0) {
    res = coarserRes(res)
    coarse = coarsenDistribution(dist, res)
  }
  // Without cells, A treats each as a patch rather than refining it: fast, and close enough to rank spots.
  const patches: Distribution = { points: coarse.points.map(({ cell: _, ...pt }) => pt), floor: dist.floor }
  const ranked = coarse.points
    .map((pt) => ({ pt, A: similarityToAnswer(patches, pt.xyz, tolerance, k) }))
    .sort((a, b) => b.A - a.A)
    .slice(0, 3)

  let bestA = A
  let spot = answer
  for (const { pt } of ranked) {
    const a = similarityToAnswer(dist, pt.xyz, tolerance, k)
    if (a <= bestA) continue
    bestA = a
    spot = pt.cell ? latLngOf(pt.cell) : fromXyz(pt.xyz)
  }

  const y = toXyz(answer)
  let near = 0
  for (const pt of dist.points) if (chordDistance(pt.xyz, y) <= NEAR * tolerance) near += pt.p
  const painted = 1 - dist.floor
  return {
    best: scoreFromParts(bestA, B),
    spot,
    miss: greatCircleDistance(spot, answer),
    nearShare: painted > 0 ? near / painted : 0
  }
}

function latLngOf(h: H3Cell): LatLon {
  const [lat, lon] = cellToLatLng(h)
  return { lat, lon }
}

/** Some paint near the answer, but most of it somewhere else, and that cost something. */
export function isHedge(e: PointExplanation, score: number, tolerance: Km): boolean {
  return Math.max(e.best, score) - score >= 25 && e.nearShare >= 0.15 && e.miss > NEAR * tolerance
}
