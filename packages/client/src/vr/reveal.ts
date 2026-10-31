/** How the headset shows a round's answer: where it turns the globe, and whose paint it shows. */
import { Vector3 } from "three"
import type { H3Cell } from "@whereabouts/shared/h3"
import type { LatLon } from "@whereabouts/shared/geo"
import type { PaintLayer } from "@whereabouts/shared/paint"
import { latLonToLocal, localToLatLon } from "./sphere"
import type { VrReveal, VrRound } from "./view"

/**
 * Where the reveal turns the globe to, and how wide round it to show: the
 * answer and every guess's paint.
 */
export function framing(reveal: VrReveal, round: VrRound): { at: LatLon; reach: number } {
  const answerPoints = [latLonToLocal(reveal.focus)]
  const { answer } = reveal
  if ("outline" in answer)
    for (const polygon of answer.outline)
      for (const [lon, lat] of polygon[0] ?? []) answerPoints.push(latLonToLocal({ lat: lat!, lon: lon! }))
  const groups = [answerPoints]
  for (const { layer } of reveal.paints ?? [{ layer: round.paint.layer }]) {
    const cells = Object.keys(layer.toRecord()) as H3Cell[]
    if (cells.length > 0)
      groups.push(
        cells.map((h) => {
          const [lat, lon] = layer.centre(h)
          return latLonToLocal({ lat, lon })
        })
      )
  }
  // The answer and each guess count once, however many cells a guess has:
  // else a far-off guess outweighs the answer and turns it out of view.
  const mid = groups.reduce(
    (sum, g) =>
      sum.addScaledVector(
        g.reduce((s, p) => s.add(p), new Vector3()),
        1 / g.length
      ),
    new Vector3()
  )
  // Spread round the world: show it all.
  if (mid.length() < groups.length * 0.2) return { at: reveal.focus, reach: Math.PI }
  mid.normalize()
  const reach = Math.max(...groups.flat().map((p) => p.angleTo(mid)))
  return { at: localToLatLon(mid), reach: reach * 1.15 + 0.002 }
}

/** Several players' paint as one collection, each cell in its player's colour. */
export function colouredPaint(
  paints: { layer: PaintLayer; colour: string }[]
): GeoJSON.FeatureCollection<GeoJSON.Polygon, { v: number; colour?: string }> {
  return {
    type: "FeatureCollection",
    features: paints.flatMap(({ layer, colour }) =>
      layer.toGeoJSON().features.map((f) => ({ ...f, properties: { ...f.properties, colour } }))
    )
  }
}
