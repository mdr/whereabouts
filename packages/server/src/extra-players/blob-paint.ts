import { PaintLayer, resolutionForTolerance } from "@whereabouts/shared/paint/paint"
import type { LatLon } from "@whereabouts/shared/geo"
import type { PaintSubmission } from "@whereabouts/shared/protocol/views"
import type { Km } from "@whereabouts/shared/units"

/** One even blob of paint, as a player's brush would lay it for a question of this tolerance. */
export const blobPaint = (tolerance: Km, at: LatLon, radius: Km): PaintSubmission => {
  const layer = new PaintLayer(resolutionForTolerance(tolerance))
  layer.stamp(at, radius, 1)
  return { cells: layer.toRecord(), floor: 0.05 }
}
