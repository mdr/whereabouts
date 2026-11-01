import type { BorderPaint } from "./map-layers"
import type { LayerId, LayerKind } from "./map-paint"
import type { StyleLayer } from "./map-theme"

/**
 * National borders on the reveal: opaque and wider as the map zooms in, but
 * thinner and dimmer at world zoom, where they would crowd the map (and the
 * low-zoom data traces some coasts). While guessing they keep the style's
 * faint look, so the Political map detail stays a light hint.
 */
export const NATIONAL_BORDERS = ["boundary_2", "boundary_disputed"]
/** Town and city names, hidden at a state reveal so the state names stand out. */
export const PLACE_LABELS = [
  "label_other",
  "label_village",
  "label_town",
  "label_state",
  "label_city",
  "label_city_capital"
]

const ROAD_SOURCES = new Set(["transportation", "aeroway"])
const URBAN_SOURCES = new Set(["building", "landuse", "park"])

/** The part of a style layer the index reads. */
export interface IndexedLayer {
  id: string
  type: LayerKind
  "source-layer"?: string
}

/** The style's layers sorted by what the map detail toggles. */
export interface StyleIndex {
  labels: string[]
  borders: LayerId<"line">[]
  /** The style's own width and opacity for the national borders, restored after the reveal. */
  nationalBorderPaint: Map<LayerId<"line">, BorderPaint>
  /** Roads, railways, buildings, airports, urban land use: man-made hints. */
  roads: string[]
  urban: string[]
  ice: string[]
  wood: string[]
  /** River lines; lakes are handled by filtering the shared water layer. */
  waterways: string[]
  waterFilter: unknown
  styleLayers: StyleLayer[]
}

export const emptyStyleIndex = (): StyleIndex => ({
  labels: [],
  borders: [],
  nationalBorderPaint: new Map(),
  roads: [],
  urban: [],
  ice: [],
  wood: [],
  waterways: [],
  waterFilter: undefined,
  styleLayers: []
})

export const indexStyle = (
  layers: readonly IndexedLayer[],
  borderPaintOf: (id: LayerId<"line">) => BorderPaint,
  filterOf: (id: string) => unknown
): StyleIndex => {
  const index = emptyStyleIndex()
  for (const layer of layers) {
    const sourceLayer = layer["source-layer"] ?? ""
    index.styleLayers.push({ id: layer.id, type: layer.type, sourceLayer })
    if (layer.type === "symbol") index.labels.push(layer.id)
    else if (layer.id.startsWith("boundary")) {
      index.borders.push(layer.id)
      if (NATIONAL_BORDERS.includes(layer.id)) index.nationalBorderPaint.set(layer.id, borderPaintOf(layer.id))
    } else if (ROAD_SOURCES.has(sourceLayer)) index.roads.push(layer.id)
    else if (URBAN_SOURCES.has(sourceLayer)) index.urban.push(layer.id)
    else if (sourceLayer === "waterway") index.waterways.push(layer.id)
    // Glaciers and ice shelves: they trace mountain ranges and polar coasts.
    else if (layer.id === "landcover_wood") index.wood.push(layer.id)
    else if (layer.id.startsWith("landcover_")) index.ice.push(layer.id)
    else if (layer.id === "water") index.waterFilter = filterOf("water")
  }
  return index
}
