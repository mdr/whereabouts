/**
 * The score review, for playtesters tuning the scoring: made-up guesses at
 * real questions (see score-review.ts), the answer and the scores they get.
 * One guess alone asks whether its score is fair; two at the same answer
 * ask which deserves more. Verdicts stay in the browser until exported, a
 * line of JSON each, every one carrying its cases so they can be re-scored
 * as the scoring changes. Linked from nowhere.
 */
import { MapView } from "../../../ui/map/MapView/MapView"
import { useOutlines } from "../../../data/outlines"
import { LoadingOutlines } from "../../../ui/map/LoadingOutlines/LoadingOutlines"
import { Review } from "../Review"

export function ScoreReview() {
  return (
    <MapView>
      <ReviewLoader />
    </MapView>
  )
}

function ReviewLoader() {
  const loaded = useOutlines(true)
  if (!loaded) return <LoadingOutlines />
  return <Review outlines={loaded} />
}
