import { useMemo } from "preact/hooks"
import {
  describePoint,
  describeRegion,
  edgeName,
  explainPoint,
  regionMisfit,
  type Distribution,
  type Kernel,
  type LatLon,
  type RegionQuestion
} from "@whereabouts/shared"

interface PointScore {
  dist: Distribution
  answer: LatLon
  toleranceKm: number
  score: number
  A: number
  B: number
  kernel: Kernel
}

/** What the paint risked, and what the distance cost. */
export function pointWhy({ dist, answer, toleranceKm, score, A, B, kernel }: PointScore): string {
  return describePoint(explainPoint(dist, answer, toleranceKm, A, B, kernel), score, toleranceKm)
}

/** What kept the paint from matching a country's shape. */
export function regionWhy(dist: Distribution, q: RegionQuestion): string {
  return describeRegion(regionMisfit(dist, q), q.label, q.toleranceKm, edgeName(q.topic))
}

/** A line under a place's score. */
export function PointWhy(props: PointScore) {
  const { dist, answer, toleranceKm, score, A, B, kernel } = props
  const text = useMemo(() => pointWhy(props), [dist, answer, toleranceKm, score, A, B, kernel.id])
  return <div class="fit">{text}</div>
}

/** A line under a country's score. */
export function RegionWhy({ dist, q }: { dist: Distribution; q: RegionQuestion }) {
  const text = useMemo(() => regionWhy(dist, q), [dist, q.id])
  return <div class="fit">{text}</div>
}
