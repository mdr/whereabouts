/** How the headset shows a round's answer: where it turns the globe, and whose paint it shows. */
import type { CssColour } from "@whereabouts/shared/colours"
import { Vector3 } from "three"
import type { H3Cell } from "@whereabouts/shared/h3"
import type { LatLon } from "@whereabouts/shared/geo"
import type { Radians } from "@whereabouts/shared/units"
import type { PaintLayer } from "@whereabouts/shared/paint/paint"
import { latLonToLocal, localToLatLon } from "./globe/sphere"
import { VrAnswerType, VrPaintsType, type VrReveal, type VrRound } from "./view/view"

/**
 * Where the reveal turns the globe to, and how wide round it to show: the
 * answer and every guess's paint.
 */
export const framing = (reveal: VrReveal, round: VrRound): { at: LatLon; reach: Radians } => {
  const answerPoints = [latLonToLocal(reveal.focus)]
  const { answer } = reveal
  if (answer?.type === VrAnswerType.OUTLINE)
    for (const polygon of answer.outline)
      for (const [lon, lat] of polygon[0] ?? []) answerPoints.push(latLonToLocal({ lat: lat, lon: lon }))
  const groups = [answerPoints]
  const painted = reveal.paints.type === VrPaintsType.PLAYERS ? reveal.paints.paints : [{ layer: round.paint.layer }]
  for (const { layer } of painted) {
    const cells = Object.keys(layer.toRecord()) as H3Cell[]
    if (cells.length > 0)
      groups.push(
        cells.map((cell) => {
          const { lat, lon } = layer.centre(cell)
          return latLonToLocal({ lat, lon })
        })
      )
  }
  // The answer and each guess count once, however many cells a guess has:
  // else a far-off guess outweighs the answer and turns it out of view.
  const mid = groups.reduce(
    (sum, group) =>
      sum.addScaledVector(
        group.reduce((total, point) => total.add(point), new Vector3()),
        1 / group.length
      ),
    new Vector3()
  )
  // Spread round the world: show it all.
  if (mid.length() < groups.length * 0.2) return { at: reveal.focus, reach: Math.PI }
  mid.normalize()
  const reach = Math.max(...groups.flat().map((point) => point.angleTo(mid)))
  return { at: localToLatLon(mid), reach: reach * 1.15 + 0.002 }
}

/** Several players' paint as one collection, each cell in its player's colour. */
export const colouredPaint = (
  paints: { layer: PaintLayer; colour: CssColour }[]
): GeoJSON.FeatureCollection<GeoJSON.Polygon, { v: number; colour?: CssColour }> => ({
  type: "FeatureCollection",
  features: paints.flatMap(({ layer, colour }) =>
    layer.toGeoJSON().features.map((feature) => ({ ...feature, properties: { ...feature.properties, colour } }))
  )
})
