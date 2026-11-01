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
import type { Theme } from "./themes"

export interface StyleLayer {
  id: string
  type: string
  sourceLayer: string
}

export type PaintSetting = [layer: string, property: string, value: unknown]

export const PLAYER_OPACITY = ["interpolate", ["linear"], ["get", "v"], 0, 0.12, 1, 0.9]

function roadPaint(l: StyleLayer, t: Theme): PaintSetting[] {
  if (l.type === "line") return [[l.id, "line-color", t.road]]
  if (l.type === "fill") return [[l.id, "fill-color", t.road]]
  return []
}

/** The theme colours for one of the style's own layers. */
export function styleLayerPaint(l: StyleLayer, t: Theme): PaintSetting[] {
  if (l.type === "background") return [[l.id, "background-color", t.land]]
  if (l.id === "water") return [[l.id, "fill-color", t.water]]
  if (l.id === "landcover_wood") return [[l.id, "fill-color", t.wood]]
  if (l.id.startsWith("landcover_")) return [[l.id, "fill-color", t.ice]]
  if (l.sourceLayer === "waterway" && l.type === "line") return [[l.id, "line-color", t.waterway]]
  if (l.type === "symbol") {
    return [
      [l.id, "text-color", t.labelText],
      [l.id, "text-halo-color", t.labelHalo]
    ]
  }
  if (["transportation", "aeroway"].includes(l.sourceLayer)) return roadPaint(l, t)
  if (["landuse", "park", "building"].includes(l.sourceLayer)) {
    const fill: PaintSetting = [l.id, "fill-color", t.urban]
    return l.id === "building" ? [fill, [l.id, "fill-outline-color", t.urban]] : [fill]
  }
  return []
}

/** The theme colours for the game's own overlay layers. */
export function overlayPaint(t: Theme): PaintSetting[] {
  return [
    [STATE_BORDERS, "line-color", t.revealBorder],
    [STATE_LABELS, "text-color", t.labelText],
    [STATE_LABELS, "text-halo-color", t.labelHalo],
    [REVEAL_ANSWER, "circle-color", t.answer],
    [REVEAL_ANSWER, "circle-stroke-color", t.answerStroke],
    [REVEAL_REGION_FILL, "fill-color", t.answer],
    [REVEAL_REGION_LINE, "line-color", t.answer],
    [HINT_FILL, "fill-color", t.brush],
    [HINT_EDGE, "line-color", t.brush],
    [CURSOR_FILL, "fill-color", t.brush],
    [CURSOR_OUTLINE, "line-color", t.brush]
  ]
}

/** The paint layer's colour and opacity expressions, from the theme's ramp. */
export function paintRamp(t: Theme): { color: unknown[]; opacity: unknown[] } {
  return {
    color: ["interpolate", ["linear"], ["get", "v"], 0, t.ramp[0], 1 / 3, t.ramp[1], 2 / 3, t.ramp[2], 1, t.ramp[3]],
    opacity: ["interpolate", ["linear"], ["get", "v"], 0, t.rampOpacity[0], 1, t.rampOpacity[1]]
  }
}
