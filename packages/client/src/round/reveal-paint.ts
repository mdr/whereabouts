import { PaintLayer } from "@whereabouts/shared/paint/paint"
import { colourCss, type CssColour } from "@whereabouts/shared/colours"
import type { PlayerId } from "@whereabouts/shared/ids"
import type { H3Resolution } from "@whereabouts/shared/h3"
import { RoundGuessType, type PaintSubmission, type RoundResultView } from "@whereabouts/shared/protocol/views"

/** A player's paint at a reveal, in their colour and marked as theirs, ready to draw. */
export interface PlayerPaint {
  layer: PaintLayer
  colour: CssColour
  features: GeoJSON.Feature[]
}

// A reveal's paint objects last as long as it does, so hovering and picking players reuse these.
const layers = new WeakMap<PaintSubmission, PaintLayer>()
const coloured = new WeakMap<PaintSubmission, PlayerPaint>()

export const paintLayer = (resolution: H3Resolution, paint: PaintSubmission): PaintLayer => {
  let layer = layers.get(paint)
  if (!layer) layers.set(paint, (layer = PaintLayer.fromRecord(resolution, paint.cells)))
  return layer
}

const playerPaint = (
  player: PlayerId,
  resolution: H3Resolution,
  paint: PaintSubmission,
  colour: CssColour
): PlayerPaint => {
  const cached = coloured.get(paint)
  if (cached?.colour === colour) return cached
  const layer = paintLayer(resolution, paint)
  const features = layer
    .toGeoJSON()
    .features.map((feature) => ({ ...feature, properties: { ...feature.properties, colour, player } }))
  const made = { layer, colour, features }
  coloured.set(paint, made)
  return made
}

/** These results' paint in their players' colours, best last so it draws on top. */
export const paintsOf = (results: RoundResultView[]): PlayerPaint[] =>
  [...results]
    .reverse()
    .flatMap((result) =>
      result.guess.type === RoundGuessType.PAINTED
        ? [playerPaint(result.playerId, result.guess.resolution, result.guess.paint, colourCss(result.colour))]
        : []
    )
