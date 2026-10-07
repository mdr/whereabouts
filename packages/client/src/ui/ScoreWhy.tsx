import { useMemo } from "preact/hooks"
import {
  describePoint,
  describeRegion,
  explainPoint,
  regionMisfit,
  type Distribution,
  type Kernel,
  type LatLon,
  type RegionQuestion
} from "@whereabouts/shared"

/** A line under a place's score: what the paint risked, and what the distance cost. */
export function PointWhy(props: {
  dist: Distribution
  answer: LatLon
  toleranceKm: number
  score: number
  A: number
  B: number
  kernel: Kernel
}) {
  const { dist, answer, toleranceKm, score, A, B, kernel } = props
  const text = useMemo(
    () => describePoint(explainPoint(dist, answer, toleranceKm, A, B, kernel), score, toleranceKm),
    [dist, answer, toleranceKm, A, B, kernel.id]
  )
  return <div class="fit">{text}</div>
}

/** A line under a country's score: what kept the paint from matching it. */
export function RegionWhy({ dist, q }: { dist: Distribution; q: RegionQuestion }) {
  const text = useMemo(() => describeRegion(regionMisfit(dist, q), q.label, q.toleranceKm), [dist, q.id])
  return <div class="fit">{text}</div>
}
