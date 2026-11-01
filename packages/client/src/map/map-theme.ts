import {
  CURSOR_FILL,
  CURSOR_OUTLINE,
  HINT_EDGE,
  HINT_FILL,
  REVEAL_ANSWER,
  REVEAL_REGION_FILL,
  REVEAL_REGION_LINE,
  STATE_BORDERS,
  STATE_LABELS
} from "./map-layers"
import { idOfKind, paintSetting, type LayerKind, type PaintSetting, type PaintValue } from "./map-paint"
import type { Theme } from "./themes"

export interface StyleLayer {
  id: string
  type: LayerKind
  sourceLayer: string
}

export const PLAYER_OPACITY: PaintValue<"fill", "fill-opacity"> = [
  "interpolate",
  ["linear"],
  ["get", "v"],
  0,
  0.12,
  1,
  0.9
]

function roadPaint(l: StyleLayer, t: Theme): PaintSetting[] {
  const line = idOfKind(l, "line")
  if (line) return [paintSetting(line, "line-color", t.road)]
  const fill = idOfKind(l, "fill")
  if (fill) return [paintSetting(fill, "fill-color", t.road)]
  return []
}

function fillPaint(l: StyleLayer, t: Theme): PaintSetting[] | undefined {
  const fill = idOfKind(l, "fill")
  if (!fill) return undefined
  if (l.id === "water") return [paintSetting(fill, "fill-color", t.water)]
  if (l.id === "landcover_wood") return [paintSetting(fill, "fill-color", t.wood)]
  if (l.id.startsWith("landcover_")) return [paintSetting(fill, "fill-color", t.ice)]
  if (["landuse", "park", "building"].includes(l.sourceLayer)) {
    const urban = paintSetting(fill, "fill-color", t.urban)
    return l.id === "building" ? [urban, paintSetting(fill, "fill-outline-color", t.urban)] : [urban]
  }
  return undefined
}

/** The theme colours for one of the style's own layers. */
export function styleLayerPaint(l: StyleLayer, t: Theme): PaintSetting[] {
  const background = idOfKind(l, "background")
  if (background) return [paintSetting(background, "background-color", t.land)]
  const symbol = idOfKind(l, "symbol")
  if (symbol) {
    return [paintSetting(symbol, "text-color", t.labelText), paintSetting(symbol, "text-halo-color", t.labelHalo)]
  }
  const line = idOfKind(l, "line")
  if (line && l.sourceLayer === "waterway") return [paintSetting(line, "line-color", t.waterway)]
  const filled = fillPaint(l, t)
  if (filled) return filled
  if (["transportation", "aeroway"].includes(l.sourceLayer)) return roadPaint(l, t)
  return []
}

/** The theme colours for the game's own overlay layers. */
export function overlayPaint(t: Theme): PaintSetting[] {
  return [
    paintSetting(STATE_BORDERS, "line-color", t.revealBorder),
    paintSetting(STATE_LABELS, "text-color", t.labelText),
    paintSetting(STATE_LABELS, "text-halo-color", t.labelHalo),
    paintSetting(REVEAL_ANSWER, "circle-color", t.answer),
    paintSetting(REVEAL_ANSWER, "circle-stroke-color", t.answerStroke),
    paintSetting(REVEAL_REGION_FILL, "fill-color", t.answer),
    paintSetting(REVEAL_REGION_LINE, "line-color", t.answer),
    paintSetting(HINT_FILL, "fill-color", t.brush),
    paintSetting(HINT_EDGE, "line-color", t.brush),
    paintSetting(CURSOR_FILL, "fill-color", t.brush),
    paintSetting(CURSOR_OUTLINE, "line-color", t.brush)
  ]
}

/** The paint layer's colour and opacity expressions, from the theme's ramp. */
export function paintRamp(t: Theme): {
  color: PaintValue<"fill", "fill-color">
  opacity: PaintValue<"fill", "fill-opacity">
} {
  return {
    color: ["interpolate", ["linear"], ["get", "v"], 0, t.ramp[0], 1 / 3, t.ramp[1], 2 / 3, t.ramp[2], 1, t.ramp[3]],
    opacity: ["interpolate", ["linear"], ["get", "v"], 0, t.rampOpacity[0], 1, t.rampOpacity[1]]
  }
}
