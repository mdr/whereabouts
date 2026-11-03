import { kmToDegrees, toRadians, type LatLon } from "@whereabouts/shared/geo"
import type { PaintSubmission } from "@whereabouts/shared/protocol/views"
import { answerCentre, type Question } from "@whereabouts/shared/questions"
import { blobPaint } from "./blob-paint.ts"

/** The farthest a guess lands from the answer, in tolerances. */
const MAX_OFFSET = 3
const MAX_LATITUDE = 85

/** A blob of paint near the answer, a random distance and direction off, so a room's scores vary. */
export const scatteredPaint = (question: Question, random: () => number): PaintSubmission => {
  const { tolerance } = question.answer
  const centre = answerCentre(question.answer)
  const distance = random() * MAX_OFFSET * tolerance
  const heading = random() * 2 * Math.PI
  const lat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, centre.lat + kmToDegrees(distance * Math.cos(heading))))
  const lon = centre.lon + kmToDegrees((distance * Math.sin(heading)) / Math.cos(toRadians(lat)))
  const at: LatLon = { lat, lon: ((((lon + 180) % 360) + 360) % 360) - 180 }
  return blobPaint(tolerance, at, tolerance * (0.4 + random() * 0.8))
}
