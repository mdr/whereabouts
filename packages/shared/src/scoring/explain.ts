/**
 * What a place's score is made of, for the awards: what the paint risked and
 * where it went wrong.
 *
 * A place's score is 500 (1 + 2A - B), and only A depends on where the
 * answer is. So 1000 - score splits exactly into two costs, each at least 0:
 * the spread (1000 less the best this paint could score, had the answer been
 * where it is strongest) and the distance (that best less the score).
 */
import { cellToLatLng, coarserResolution, getResolution, h3Resolution, type H3Cell } from "../h3.ts"
import { chordDistance, fromXyz, greatCircleDistance, toXyz, type LatLon } from "../geo.ts"
import type { Km, Points } from "../units.ts"
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
  best: Points
  /** Where that is. */
  spot: LatLon
  /** From there to the answer. */
  miss: Km
  /** The share of the paint, the world floor left out, within NEAR_TOLERANCES tolerances of the answer. */
  nearShare: number
}

/** Candidate spots are tried on the paint merged to about this many cells, then the best few exactly. */
const SEARCH_CELLS = 300
const NEAR_TOLERANCES = 4

export const explainPoint = (
  painted: Distribution,
  answer: LatLon,
  tolerance: Km,
  A: number,
  B: number,
  k: Kernel = DEFAULT_KERNEL
): PointExplanation => {
  let coarse = painted
  let resolution = h3Resolution(
    Math.max(0, ...painted.points.map((point) => (point.cell ? getResolution(point.cell) : 0)))
  )
  while (coarse.points.length > SEARCH_CELLS && resolution > 0) {
    resolution = coarserResolution(resolution)
    coarse = coarsenDistribution(painted, resolution)
  }
  // Without cells, A treats each as a patch rather than refining it: fast, and close enough to rank spots.
  const patches: Distribution = { points: coarse.points.map(({ cell: _, ...point }) => point), floor: painted.floor }
  const ranked = coarse.points
    .map((point) => ({ point, A: similarityToAnswer(patches, point.xyz, tolerance, k) }))
    .sort((a, b) => b.A - a.A)
    .slice(0, 3)

  let bestA = A
  let spot = answer
  for (const { point } of ranked) {
    const similarity = similarityToAnswer(painted, point.xyz, tolerance, k)
    if (similarity <= bestA) continue
    bestA = similarity
    spot = point.cell ? latLngOf(point.cell) : fromXyz(point.xyz)
  }

  const answerXyz = toXyz(answer)
  let near = 0
  for (const point of painted.points) {
    if (chordDistance(point.xyz, answerXyz) <= NEAR_TOLERANCES * tolerance) near += point.p
  }
  const paintedMass = 1 - painted.floor
  return {
    best: scoreFromParts(bestA, B),
    spot,
    miss: greatCircleDistance(spot, answer),
    nearShare: paintedMass > 0 ? near / paintedMass : 0
  }
}

const latLngOf = (cell: H3Cell): LatLon => {
  const [lat, lon] = cellToLatLng(cell)
  return { lat, lon }
}

/** Some paint near the answer, but most of it somewhere else, and that cost something. */
export const isHedge = (explanation: PointExplanation, score: Points, tolerance: Km): boolean => {
  return (
    Math.max(explanation.best, score) - score >= 25 &&
    explanation.nearShare >= 0.15 &&
    explanation.miss > NEAR_TOLERANCES * tolerance
  )
}
