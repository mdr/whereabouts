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

function roadPaint(layer: StyleLayer, theme: Theme): PaintSetting[] {
  const line = idOfKind(layer, "line")
  if (line) return [paintSetting(line, "line-color", theme.road)]
  const fill = idOfKind(layer, "fill")
  if (fill) return [paintSetting(fill, "fill-color", theme.road)]
  return []
}

function fillPaint(layer: StyleLayer, theme: Theme): PaintSetting[] | undefined {
  const fill = idOfKind(layer, "fill")
  if (!fill) return undefined
  if (layer.id === "water") return [paintSetting(fill, "fill-color", theme.water)]
  if (layer.id === "landcover_wood") return [paintSetting(fill, "fill-color", theme.wood)]
  if (layer.id.startsWith("landcover_")) return [paintSetting(fill, "fill-color", theme.ice)]
  if (["landuse", "park", "building"].includes(layer.sourceLayer)) {
    const urban = paintSetting(fill, "fill-color", theme.urban)
    return layer.id === "building" ? [urban, paintSetting(fill, "fill-outline-color", theme.urban)] : [urban]
  }
  return undefined
}

/** The theme colours for one of the style's own layers. */
export function styleLayerPaint(layer: StyleLayer, theme: Theme): PaintSetting[] {
  const background = idOfKind(layer, "background")
  if (background) return [paintSetting(background, "background-color", theme.land)]
  const symbol = idOfKind(layer, "symbol")
  if (symbol) {
    return [
      paintSetting(symbol, "text-color", theme.labelText),
      paintSetting(symbol, "text-halo-color", theme.labelHalo)
    ]
  }
  const line = idOfKind(layer, "line")
  if (line && layer.sourceLayer === "waterway") return [paintSetting(line, "line-color", theme.waterway)]
  const filled = fillPaint(layer, theme)
  if (filled) return filled
  if (["transportation", "aeroway"].includes(layer.sourceLayer)) return roadPaint(layer, theme)
  return []
}

/** The theme colours for the game's own overlay layers. */
export function overlayPaint(theme: Theme): PaintSetting[] {
  return [
    paintSetting(STATE_BORDERS, "line-color", theme.revealBorder),
    paintSetting(STATE_LABELS, "text-color", theme.labelText),
    paintSetting(STATE_LABELS, "text-halo-color", theme.labelHalo),
    paintSetting(REVEAL_ANSWER, "circle-color", theme.answer),
    paintSetting(REVEAL_ANSWER, "circle-stroke-color", theme.answerStroke),
    paintSetting(REVEAL_REGION_FILL, "fill-color", theme.answer),
    paintSetting(REVEAL_REGION_LINE, "line-color", theme.answer),
    paintSetting(HINT_FILL, "fill-color", theme.brush),
    paintSetting(HINT_EDGE, "line-color", theme.brush),
    paintSetting(CURSOR_FILL, "fill-color", theme.brush),
    paintSetting(CURSOR_OUTLINE, "line-color", theme.brush)
  ]
}

/** The paint layer's colour and opacity expressions, from the theme's ramp. */
export function paintRamp(theme: Theme): {
  color: PaintValue<"fill", "fill-color">
  opacity: PaintValue<"fill", "fill-opacity">
} {
  return {
    color: [
      "interpolate",
      ["linear"],
      ["get", "v"],
      0,
      theme.ramp[0],
      1 / 3,
      theme.ramp[1],
      2 / 3,
      theme.ramp[2],
      1,
      theme.ramp[3]
    ],
    opacity: ["interpolate", ["linear"], ["get", "v"], 0, theme.rampOpacity[0], 1, theme.rampOpacity[1]]
  }
}
