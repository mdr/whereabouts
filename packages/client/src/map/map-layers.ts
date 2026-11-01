import type { FilterSpecification, Map as MapLibreMap } from "maplibre-gl"
import type { Theme } from "./themes"

export const PAINT_SOURCE = "paint"
export const REVEAL_SOURCE = "reveal"
export const CURSOR_SOURCE = "cursor"
export const HINT_SOURCE = "hint"
const TERRAIN_SOURCE = "terrain"
export const TERRAIN_LAYER = "terrain-hillshade"
/** Natural Earth II colour relief, declared (but not drawn) by the positron style. */
const COLOUR_SOURCE = "ne2_shaded"
export const COLOUR_LAYER = "natural-colour"
/** US states, and other countries' provinces, for the reveal of a state round. The style draws them only from zoom 8. */
export const STATE_BORDERS = "state-borders"
export const STATE_LABELS = "state-labels"

export const PAINT_FILL = "paint-fill"
export const HINT_FILL = "hint-fill"
export const HINT_EDGE = "hint-edge"
export const REVEAL_REGION_FILL = "reveal-region-fill"
export const REVEAL_REGION_LINE = "reveal-region-line"
export const REVEAL_ANSWER = "reveal-answer"
export const CURSOR_FILL = "cursor-fill"
export const CURSOR_OUTLINE = "cursor-outline"

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] }
}

/** Adds the game's own sources and layers above the style's. Layers are added in stacking order. */
export function addGameLayers(map: MapLibreMap, labelLayers: string[], theme: Theme | undefined): void {
  const below = map.getLayer("water") ? "water" : labelLayers[0]
  addRelief(map, below)
  addStateLayers(map, labelLayers[0], theme)
  addHintLayers(map)
  addPaintLayers(map)
  addRevealLayers(map)
  addCursorLayers(map)
}

function addRelief(map: MapLibreMap, below: string | undefined): void {
  // Shaded relief for the reveal, from the public AWS terrain tiles. It
  // starts hidden, and MapLibre fetches nothing for a hidden layer, so
  // guessing costs no tile requests. It goes just under the water layer:
  // the tiles carry ocean depths too, and the sea should stay flat.
  map.addSource(TERRAIN_SOURCE, {
    type: "raster-dem",
    tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
    encoding: "terrarium",
    tileSize: 256,
    maxzoom: 15,
    attribution:
      '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank">Terrain: Mapzen, AWS Open Data</a>'
  })
  // Natural colour for the reveal: greens, desert sand, white ice, from
  // Natural Earth II relief tiles on the same host as the map. Like the
  // relief it starts hidden and sits under the water (the tiles paint
  // the sea white). Dimmed to sit on the dark theme.
  if (map.getSource(COLOUR_SOURCE)) {
    map.addLayer(
      {
        id: COLOUR_LAYER,
        type: "raster",
        source: COLOUR_SOURCE,
        layout: { visibility: "none" },
        paint: {
          "raster-opacity": 0.9,
          "raster-brightness-max": 0.55,
          "raster-saturation": 0.2
        }
      },
      below
    )
  }
  map.addLayer(
    {
      id: TERRAIN_LAYER,
      type: "hillshade",
      source: TERRAIN_SOURCE,
      layout: { visibility: "none" },
      paint: {
        "hillshade-exaggeration": 0.3,
        "hillshade-shadow-color": "rgba(0, 0, 0, 0.55)",
        "hillshade-highlight-color": "rgba(255, 255, 255, 0.18)",
        "hillshade-accent-color": "rgba(0, 0, 0, 0.3)"
      }
    },
    below
  )
}

function addStateLayers(map: MapLibreMap, firstLabelLayer: string | undefined, theme: Theme | undefined): void {
  if (!map.getSource("openmaptiles")) return
  map.addLayer(
    {
      id: STATE_BORDERS,
      type: "line",
      source: "openmaptiles",
      "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
      layout: { visibility: "none", "line-join": "round" },
      paint: { "line-color": theme?.revealBorder ?? "#c4d0de", "line-width": 1, "line-opacity": 0.7 }
    },
    firstLabelLayer
  )
  // The style's own state names start at zoom 5, closer in than a state reveal.
  map.addLayer({
    id: STATE_LABELS,
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "place",
    maxzoom: 9,
    filter: ["==", ["get", "class"], "state"],
    layout: {
      visibility: "none",
      "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]],
      "text-font": ["Noto Sans Bold"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 6, 15],
      "text-transform": "uppercase",
      "text-letter-spacing": 0.08,
      "text-max-width": 8
    },
    paint: {
      "text-color": theme?.labelText ?? "#cfd8e3",
      "text-halo-color": theme?.labelHalo ?? "#000000",
      "text-halo-width": 1.5
    }
  })
}

function addHintLayers(map: MapLibreMap): void {
  // A hint's band, under the paint so painting over it stays readable.
  map.addSource(HINT_SOURCE, { type: "geojson", data: emptyCollection() })
  map.addLayer({
    id: HINT_FILL,
    type: "fill",
    source: HINT_SOURCE,
    paint: { "fill-color": "#ffffff", "fill-opacity": 0.1 }
  })
  map.addLayer({
    id: HINT_EDGE,
    type: "line",
    source: HINT_SOURCE,
    paint: { "line-color": "#ffffff", "line-width": 1.5, "line-opacity": 0.8, "line-dasharray": [4, 3] }
  })
}

function addPaintLayers(map: MapLibreMap): void {
  map.addSource(PAINT_SOURCE, { type: "geojson", data: emptyCollection() })
  map.addLayer({
    id: PAINT_FILL,
    type: "fill",
    source: PAINT_SOURCE,
    paint: {
      "fill-color": [
        "interpolate",
        ["linear"],
        ["get", "v"],
        0,
        "#ffe082",
        0.35,
        "#ffa726",
        0.7,
        "#f4511e",
        1,
        "#b71c1c"
      ],
      "fill-opacity": ["interpolate", ["linear"], ["get", "v"], 0, 0.2, 1, 0.8],
      "fill-antialias": true
    }
  })
}

function addRevealLayers(map: MapLibreMap): void {
  map.addSource(REVEAL_SOURCE, { type: "geojson", data: emptyCollection() })
  // A region answer: the country filled faintly and outlined.
  const isArea: FilterSpecification = ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]]
  map.addLayer({
    id: REVEAL_REGION_FILL,
    type: "fill",
    source: REVEAL_SOURCE,
    filter: isArea,
    paint: { "fill-color": "#fbbf24", "fill-opacity": 0.12 }
  })
  map.addLayer({
    id: REVEAL_REGION_LINE,
    type: "line",
    source: REVEAL_SOURCE,
    filter: isArea,
    paint: { "line-color": "#fbbf24", "line-width": 2 }
  })
  map.addLayer({
    id: REVEAL_ANSWER,
    type: "circle",
    source: REVEAL_SOURCE,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": 7,
      "circle-color": "#1565c0",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2.5
    }
  })
}

function addCursorLayers(map: MapLibreMap): void {
  // Brush footprint: the exact cells the next stamp would touch.
  map.addSource(CURSOR_SOURCE, { type: "geojson", data: emptyCollection() })
  map.addLayer({
    id: CURSOR_FILL,
    type: "fill",
    source: CURSOR_SOURCE,
    paint: { "fill-color": "#ffffff", "fill-opacity": 0.08 }
  })
  map.addLayer({
    id: CURSOR_OUTLINE,
    type: "line",
    source: CURSOR_SOURCE,
    paint: {
      "line-color": "#ffffff",
      "line-width": 1.5,
      "line-opacity": 0.9,
      "line-dasharray": ["case", ["==", ["get", "erase"], true], ["literal", [1, 1.5]], ["literal", [1, 0]]]
    }
  })
}
