import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type IControl,
  type Point,
  type FilterSpecification,
  type GeoJSONSource
} from "maplibre-gl"
import type * as maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
// MapLibre resolves its module worker as a sibling of its own script via
// import.meta.url. After bundling that points into /assets where no such
// file exists, so hand it a worker Vite has bundled and knows the URL of.
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
import {
  cellToBoundary,
  cellsOutline,
  type H3Cell,
  type HintBand,
  type LatLon,
  type MapDetail
} from "@whereabouts/shared"
import type { Theme } from "./themes"

setWorkerUrl(mapWorkerUrl)

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron"
const PAINT_SOURCE = "paint"
const REVEAL_SOURCE = "reveal"
const CURSOR_SOURCE = "cursor"
const HINT_SOURCE = "hint"
const TERRAIN_SOURCE = "terrain"
const TERRAIN_LAYER = "terrain-hillshade"
/** Natural Earth II colour relief, declared (but not drawn) by the positron style. */
const COLOUR_SOURCE = "ne2_shaded"
const COLOUR_LAYER = "natural-colour"

/** World circumference at the equator in metres, for metres-per-pixel maths. */
const WORLD_M = 40075016.686
const WORLD_CENTER: [number, number] = [10, 25]
const WORLD_ZOOM = 1.6
/** MapLibre's world is 512 px wide at zoom 0. */
const WORLD_PX_Z0 = 512
/**
 * MapLibre's tiles stop this far north and south. Paint beyond it is never
 * seen on the flat map, and a globe smears it into a fan at the pole.
 */
const MAX_LAT = 85.0511
/** The globe's starting size: its radius as a share of the map's shorter side. */
const GLOBE_FILL = 0.4
/** The phone layout's width, and where its reveal sheet starts, as a share of the screen's height (style.css). */
const PHONE = "(max-width: 640px)"
const SHEET_TOP = 0.5

/**
 * National borders on the reveal: opaque and wider as the map zooms in, but
 * thinner and dimmer at world zoom, where they would crowd the map (and the
 * low-zoom data traces some coasts). While guessing they keep the style's
 * faint look, so the Political map detail stays a light hint.
 */
const NATIONAL_BORDERS = ["boundary_2", "boundary_disputed"]
const REVEAL_BORDER_WIDTH = ["interpolate", ["linear"], ["zoom"], 1, 0.8, 3, 1.3, 5, 1.8, 8, 2.5]
const REVEAL_BORDER_OPACITY = ["interpolate", ["linear"], ["zoom"], 1, 0.55, 2.5, 1]
/** US states, and other countries' provinces, for the reveal of a state round. The style draws them only from zoom 8. */
const STATE_BORDERS = "state-borders"
const STATE_LABELS = "state-labels"
/** Town and city names, hidden at a state reveal so the state names stand out. */
const PLACE_LABELS = ["label_other", "label_village", "label_town", "label_state", "label_city", "label_city_capital"]

export class GameMap {
  readonly map: MapLibreMap
  readonly ready: Promise<void>
  private labelLayers: string[] = []
  private borderLayers: string[] = []
  /** The style's own width and opacity for the national borders, restored after the reveal. */
  private borderPaint = new Map<string, { width: unknown; opacity: unknown }>()
  private revealBorders = false
  /** Roads, railways, buildings, airports, urban land use: man-made hints. */
  private roadLayers: string[] = []
  private urbanLayers: string[] = []
  private iceLayers: string[] = []
  private woodLayers: string[] = []
  /** River lines; lakes are handled by filtering the shared water layer. */
  private waterwayLayers: string[] = []
  private waterFilter: unknown = undefined
  private styleLayers: { id: string; type: string; sourceLayer: string }[] = []
  private theme: Theme | undefined = undefined
  /** Set once the map is removed; layer toggles become no-ops rather than throwing. */
  private disposed = false
  private globe = false
  private globeButton: HTMLButtonElement | undefined = undefined

  constructor(container: string | HTMLElement, options: Partial<maplibregl.MapOptions> = {}) {
    this.map = new MapLibreMap({
      container,
      style: STYLE_URL,
      center: WORLD_CENTER,
      zoom: WORLD_ZOOM,
      minZoom: 1,
      maxZoom: 15,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      ...options
    })
    // A phone is too narrow for the usual view to show the whole world.
    if (options.zoom === undefined && matchMedia(PHONE).matches) {
      const zoom = this.worldZoom()
      this.map.setMinZoom(Math.min(1, zoom))
      this.map.jumpTo({ zoom })
    }
    // Bottom-left keeps the buttons clear of the HUD cards and the toolbar.
    this.map.addControl(new NavigationControl({ showCompass: false }), "bottom-left")
    this.map.keyboard.disableRotation()
    this.map.touchZoomRotate.disableRotation()
    this.ready = new Promise((resolve) => {
      this.map.once("load", () => {
        this.collapseAttribution()
        this.indexStyleLayers()
        this.addSources()
        resolve()
      })
    })
  }

  /**
   * MapLibre's compact attribution starts expanded; fold it to the (i)
   * button so it does not sit on the toolbar. The full credit is one click
   * away, as the OpenStreetMap and OpenMapTiles licences require.
   */
  private collapseAttribution(): void {
    const el = this.map.getContainer().querySelector(".maplibregl-ctrl-attrib")
    if (!el) return
    el.classList.remove("maplibregl-compact-show")
    el.removeAttribute("open")
  }

  private indexStyleLayers(): void {
    const layers = this.map.getStyle().layers
    const roadSources = new Set(["transportation", "aeroway"])
    const urbanSources = new Set(["building", "landuse", "park"])
    for (const l of layers) {
      const sourceLayer = "source-layer" in l ? (l["source-layer"] ?? "") : ""
      this.styleLayers.push({ id: l.id, type: l.type, sourceLayer })
      if (l.type === "symbol") this.labelLayers.push(l.id)
      else if (l.id.startsWith("boundary")) {
        this.borderLayers.push(l.id)
        if (NATIONAL_BORDERS.includes(l.id))
          this.borderPaint.set(l.id, {
            width: this.map.getPaintProperty(l.id, "line-width"),
            opacity: this.map.getPaintProperty(l.id, "line-opacity")
          })
      } else if (roadSources.has(sourceLayer)) this.roadLayers.push(l.id)
      else if (urbanSources.has(sourceLayer)) this.urbanLayers.push(l.id)
      else if (sourceLayer === "waterway") this.waterwayLayers.push(l.id)
      // Glaciers and ice shelves: they trace mountain ranges and polar coasts.
      else if (l.id === "landcover_wood") this.woodLayers.push(l.id)
      else if (l.id.startsWith("landcover_")) this.iceLayers.push(l.id)
      else if (l.id === "water") this.waterFilter = this.map.getFilter("water")
    }
  }

  private addSources(): void {
    // Shaded relief for the reveal, from the public AWS terrain tiles. It
    // starts hidden, and MapLibre fetches nothing for a hidden layer, so
    // guessing costs no tile requests. It goes just under the water layer:
    // the tiles carry ocean depths too, and the sea should stay flat.
    this.map.addSource(TERRAIN_SOURCE, {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 15,
      attribution:
        '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank">Terrain: Mapzen, AWS Open Data</a>'
    })
    const below = this.map.getLayer("water") ? "water" : this.labelLayers[0]
    // Natural colour for the reveal: greens, desert sand, white ice, from
    // Natural Earth II relief tiles on the same host as the map. Like the
    // relief it starts hidden and sits under the water (the tiles paint
    // the sea white). Dimmed to sit on the dark theme.
    if (this.map.getSource(COLOUR_SOURCE)) {
      this.map.addLayer(
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
    this.map.addLayer(
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
    if (this.map.getSource("openmaptiles")) {
      this.map.addLayer(
        {
          id: STATE_BORDERS,
          type: "line",
          source: "openmaptiles",
          "source-layer": "boundary",
          filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
          layout: { visibility: "none", "line-join": "round" },
          paint: { "line-color": this.theme?.revealBorder ?? "#c4d0de", "line-width": 1, "line-opacity": 0.7 }
        },
        this.labelLayers[0]
      )
      // The style's own state names start at zoom 5, closer in than a state reveal.
      this.map.addLayer({
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
          "text-color": this.theme?.labelText ?? "#cfd8e3",
          "text-halo-color": this.theme?.labelHalo ?? "#000000",
          "text-halo-width": 1.5
        }
      })
    }

    // A hint's band, under the paint so painting over it stays readable.
    this.map.addSource(HINT_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    })
    this.map.addLayer({
      id: "hint-fill",
      type: "fill",
      source: HINT_SOURCE,
      paint: { "fill-color": "#ffffff", "fill-opacity": 0.1 }
    })
    this.map.addLayer({
      id: "hint-edge",
      type: "line",
      source: HINT_SOURCE,
      paint: { "line-color": "#ffffff", "line-width": 1.5, "line-opacity": 0.8, "line-dasharray": [4, 3] }
    })

    this.map.addSource(PAINT_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    })
    this.map.addLayer({
      id: "paint-fill",
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

    this.map.addSource(REVEAL_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    })
    // A region answer: the country filled faintly and outlined.
    const isArea: FilterSpecification = ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]]
    this.map.addLayer({
      id: "reveal-region-fill",
      type: "fill",
      source: REVEAL_SOURCE,
      filter: isArea,
      paint: { "fill-color": "#fbbf24", "fill-opacity": 0.12 }
    })
    this.map.addLayer({
      id: "reveal-region-line",
      type: "line",
      source: REVEAL_SOURCE,
      filter: isArea,
      paint: { "line-color": "#fbbf24", "line-width": 2 }
    })
    this.map.addLayer({
      id: "reveal-answer",
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

    // Brush footprint: the exact cells the next stamp would touch.
    this.map.addSource(CURSOR_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] }
    })
    this.map.addLayer({
      id: "cursor-fill",
      type: "fill",
      source: CURSOR_SOURCE,
      paint: { "fill-color": "#ffffff", "fill-opacity": 0.08 }
    })
    this.map.addLayer({
      id: "cursor-outline",
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

  applyTheme(t: Theme): void {
    this.theme = t
    const set = (id: string, prop: string, value: unknown) => {
      if (this.map.getLayer(id)) this.map.setPaintProperty(id, prop as never, value as never)
    }
    for (const l of this.styleLayers) {
      if (l.type === "background") set(l.id, "background-color", t.land)
      else if (l.id === "water") set(l.id, "fill-color", t.water)
      else if (l.id === "landcover_wood") set(l.id, "fill-color", t.wood)
      else if (l.id.startsWith("landcover_")) set(l.id, "fill-color", t.ice)
      else if (l.sourceLayer === "waterway" && l.type === "line") set(l.id, "line-color", t.waterway)
      else if (l.type === "symbol") {
        set(l.id, "text-color", t.labelText)
        set(l.id, "text-halo-color", t.labelHalo)
      } else if (["transportation", "aeroway"].includes(l.sourceLayer)) {
        if (l.type === "line") set(l.id, "line-color", t.road)
        else if (l.type === "fill") set(l.id, "fill-color", t.road)
      } else if (["landuse", "park", "building"].includes(l.sourceLayer)) {
        set(l.id, "fill-color", t.urban)
        if (l.id === "building") set(l.id, "fill-outline-color", t.urban)
      }
    }
    this.styleBorders()
    this.applyPaintRamp(t)
    set(STATE_BORDERS, "line-color", t.revealBorder)
    set(STATE_LABELS, "text-color", t.labelText)
    set(STATE_LABELS, "text-halo-color", t.labelHalo)
    set("reveal-answer", "circle-color", t.answer)
    set("reveal-answer", "circle-stroke-color", t.answerStroke)
    set("reveal-region-fill", "fill-color", t.answer)
    set("reveal-region-line", "line-color", t.answer)
    set("hint-fill", "fill-color", t.brush)
    set("hint-edge", "line-color", t.brush)
    set("cursor-fill", "fill-color", t.brush)
    set("cursor-outline", "line-color", t.brush)
    document.documentElement.style.setProperty("--ring-brush", t.brush)
  }

  /**
   * Tear the map down. Effects that unmount alongside the map (the reveal
   * turning borders back off, say) may still call the toggles afterwards;
   * MapLibre throws on a removed map, so they check `disposed` first.
   */
  /** Switch between the flat map and the globe, keeping a whole-world view whole. */
  setGlobe(on: boolean): void {
    if (this.disposed || on === this.globe) return
    const wasWhole = this.map.getZoom() < this.worldZoom() + 0.5
    this.globe = on
    this.map.setProjection({ type: on ? "globe" : "mercator" })
    this.showGlobeButton()
    if (wasWhole) this.resetView()
  }

  /** A button with the zoom buttons that asks for the other projection; setGlobe makes the switch. */
  addGlobeButton(onToggle: () => void, testId: string): void {
    const button = document.createElement("button")
    button.type = "button"
    button.dataset.testid = testId
    button.innerHTML = '<span class="maplibregl-ctrl-icon" aria-hidden="true"></span>'
    button.addEventListener("click", onToggle)
    this.globeButton = button
    this.showGlobeButton()
    const control: IControl = {
      onAdd: () => {
        const el = document.createElement("div")
        el.className = "maplibregl-ctrl maplibregl-ctrl-group globe-ctrl"
        el.append(button)
        return el
      },
      onRemove: () => button.parentElement?.remove()
    }
    this.map.addControl(control, "bottom-left")
  }

  private showGlobeButton(): void {
    const button = this.globeButton
    if (!button) return
    // MapLibre's own globe icons: the one shown says what a click switches to.
    button.classList.toggle("maplibregl-ctrl-globe-enabled", this.globe)
    button.classList.toggle("maplibregl-ctrl-globe", !this.globe)
    button.title = this.globe ? "Flat map" : "Globe"
    button.setAttribute("aria-pressed", String(this.globe))
  }

  /** Whether a point on screen shows the Earth: not the space around a globe, nor past a flat map's poles. */
  onSurface(point: Point): boolean {
    const at = this.map.unproject(point)
    const back = this.map.project(at)
    return drawable(at.lat) && Math.hypot(back.x - point.x, back.y - point.y) < 1
  }

  dispose(): void {
    this.disposed = true
    this.map.remove()
  }

  setLabels(on: boolean): void {
    if (this.disposed) return
    for (const id of this.labelLayers) this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none")
  }

  /** Roads, railways and airports. */
  setRoads(on: boolean): void {
    this.setVisible(this.roadLayers, on)
  }

  /** Built-up areas: buildings, urban land use, parks. */
  setUrban(on: boolean): void {
    this.setVisible(this.urbanLayers, on)
  }

  /** Glaciers and ice shelves. Off while guessing: they pick out mountain ranges. */
  setIce(on: boolean): void {
    this.setVisible(this.iceLayers, on)
  }

  /** Woodland (from zoom 10). */
  setWood(on: boolean): void {
    this.setVisible(this.woodLayers, on)
  }

  /** Shaded relief and natural colour. */
  setTerrain(on: boolean): void {
    this.setVisible([TERRAIN_LAYER, COLOUR_LAYER], on)
  }

  /**
   * How much of the map shows: one of the game's guessing levels, or
   * "reveal" for everything but roads (they clutter at the zooms the reveal
   * uses). Place names and man-made detail show only on the reveal.
   */
  setDetail(level: MapDetail | "reveal"): void {
    // An unknown level (a stale saved setting, say) counts as minimal.
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- saved settings are not checked against the type
    const rank = { minimal: 0, water: 1, physical: 2, political: 3, reveal: 4 }[level] ?? 0
    this.setInlandWater(rank >= 1)
    this.setTerrain(rank >= 2)
    this.setIce(rank >= 2)
    this.setWood(rank >= 2)
    this.setBorders(rank >= 3, rank >= 4)
    this.setRevealBorders(level === "reveal")
    this.setLabels(rank >= 4)
    this.setUrban(rank >= 4)
    this.setRoads(false)
  }

  private setVisible(ids: string[], on: boolean): void {
    if (this.disposed) return
    for (const id of ids) {
      if (this.map.getLayer(id)) this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none")
    }
  }

  /** Rivers and lakes. Oceans always stay visible so coastlines remain. */
  setInlandWater(on: boolean): void {
    if (this.disposed) return
    for (const id of this.waterwayLayers) this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none")
    if (!this.map.getLayer("water")) return
    const base = this.waterFilter as maplibregl.FilterSpecification | undefined
    const oceanOnly = ["==", ["get", "class"], "ocean"] as unknown as maplibregl.FilterSpecification
    const combined = (base ? ["all", base, oceanOnly] : oceanOnly) as unknown as maplibregl.FilterSpecification
    this.map.setFilter("water", on ? base : combined)
  }

  /** National borders, and with `subnational` the style's state and province lines (zoom 8 on). */
  setBorders(on: boolean, subnational = on): void {
    if (this.disposed) return
    for (const id of this.borderLayers) {
      const shown = on && (subnational || NATIONAL_BORDERS.includes(id))
      this.map.setLayoutProperty(id, "visibility", shown ? "visible" : "none")
    }
  }

  /**
   * For the reveal of a state round: state lines and names at every zoom,
   * without town and city names. Never while guessing one. Call after setDetail.
   */
  setStateReveal(on: boolean): void {
    this.setVisible([STATE_BORDERS, STATE_LABELS], on)
    if (on) this.setVisible(PLACE_LABELS, false)
  }

  /** Bold national borders for the reveal, or the style's faint ones. */
  private setRevealBorders(on: boolean): void {
    this.revealBorders = on
    this.styleBorders()
  }

  private styleBorders(): void {
    if (this.disposed || !this.theme) return
    for (const id of this.borderLayers) {
      if (!this.map.getLayer(id)) continue
      const own = this.borderPaint.get(id)
      const bold = this.revealBorders && own !== undefined
      this.map.setPaintProperty(id, "line-color", bold ? this.theme.revealBorder : this.theme.border)
      if (!own) continue
      this.map.setPaintProperty(id, "line-width", (bold ? REVEAL_BORDER_WIDTH : own.width) as never)
      this.map.setPaintProperty(id, "line-opacity", (bold ? REVEAL_BORDER_OPACITY : own.opacity) as never)
    }
  }

  private source(id: string): GeoJSONSource | undefined {
    return this.map.getSource(id)
  }

  setPaint(data: GeoJSON.FeatureCollection): void {
    const features = data.features.filter(
      (f) =>
        f.geometry.type !== "Polygon" || f.geometry.coordinates.every((ring) => ring.every(([, lat]) => drawable(lat!)))
    )
    void this.source(PAINT_SOURCE)?.setData({ ...data, features })
  }

  /** Outline the cells the next stamp would touch; undefined hides it. Dotted when erasing. */
  setCursorFootprint(cells: H3Cell[] | undefined, erase = false): void {
    const shown = cells?.filter((c) => cellToBoundary(c).every(([lat]) => drawable(lat)))
    const features: GeoJSON.Feature[] = shown?.length
      ? [{ type: "Feature", properties: { erase }, geometry: cellsOutline(shown) }]
      : []
    void this.source(CURSOR_SOURCE)?.setData({ type: "FeatureCollection", features })
  }

  /** Outline a shape as the cursor instead (the country the Fill tool would fill); dotted when it would unfill. */
  setCursorShape(shape: GeoJSON.MultiPolygon | undefined, erase = false): void {
    const features: GeoJSON.Feature[] = shape ? [{ type: "Feature", properties: { erase }, geometry: shape }] : []
    void this.source(CURSOR_SOURCE)?.setData({ type: "FeatureCollection", features })
  }

  /**
   * Colour the paint layer with a single hue (a player's colour) instead of
   * the theme ramp. Pass undefined to restore the ramp.
   */
  setPaintColour(colour: string | undefined): void {
    if (!this.map.getLayer("paint-fill")) return
    if (colour === undefined) {
      if (this.theme) this.applyPaintRamp(this.theme)
      return
    }
    this.map.setPaintProperty("paint-fill", "fill-color", colour)
    this.map.setPaintProperty("paint-fill", "fill-opacity", ["interpolate", ["linear"], ["get", "v"], 0, 0.12, 1, 0.9])
  }

  /** Colour each feature by its own `colour` property, for several players at once. */
  setPaintColourPerFeature(): void {
    if (!this.map.getLayer("paint-fill")) return
    this.map.setPaintProperty("paint-fill", "fill-color", ["coalesce", ["get", "colour"], "#888888"])
    this.map.setPaintProperty("paint-fill", "fill-opacity", ["interpolate", ["linear"], ["get", "v"], 0, 0.12, 1, 0.9])
  }

  private applyPaintRamp(t: Theme): void {
    if (!this.map.getLayer("paint-fill")) return
    this.map.setPaintProperty("paint-fill", "fill-color", [
      "interpolate",
      ["linear"],
      ["get", "v"],
      0,
      t.ramp[0],
      1 / 3,
      t.ramp[1],
      2 / 3,
      t.ramp[2],
      1,
      t.ramp[3]
    ])
    this.map.setPaintProperty("paint-fill", "fill-opacity", [
      "interpolate",
      ["linear"],
      ["get", "v"],
      0,
      t.rampOpacity[0],
      1,
      t.rampOpacity[1]
    ])
  }

  /** Marker at the answer. The tolerance rings were tried and dropped: one clear dot reads better. */
  showReveal(answer: LatLon, _toleranceKm: number): void {
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [answer.lon, answer.lat] }
        }
      ]
    }
    void this.source(REVEAL_SOURCE)?.setData(fc)
  }

  /** A region answer: the outline (GeoJSON MultiPolygon coordinates), filled faintly. */
  showRegionReveal(outline: number[][][][]): void {
    void this.source(REVEAL_SOURCE)?.setData({
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: outline } }]
    })
  }

  /** Shade a hint's band, or clear it. */
  setHint(band: HintBand | undefined): void {
    if (this.disposed) return
    void this.source(HINT_SOURCE)?.setData({
      type: "FeatureCollection",
      features: band ? hintFeatures(band) : []
    })
  }

  clearReveal(): void {
    void this.source(REVEAL_SOURCE)?.setData({
      type: "FeatureCollection",
      features: []
    })
  }

  /** At a latitude on the flat map. A globe has one scale, the flat map's at the view's centre. */
  metersPerPixel(lat: number): number {
    const z = this.map.getZoom()
    const at = this.globe ? this.map.getCenter().lat : lat
    return (WORLD_M * Math.cos((at * Math.PI) / 180)) / (WORLD_PX_Z0 * Math.pow(2, z))
  }

  /** Back to the whole-world starting view, e.g. at the start of a round. */
  resetView(): void {
    void this.map.easeTo({ center: WORLD_CENTER, zoom: this.worldZoom(), duration: 700 })
  }

  /**
   * The zoom of the whole-world view. On a phone the flat map fits the
   * world's width to the screen. A globe is sized to the map: in the
   * camera's perspective a sphere of radius R px, seen from f px away, shows
   * a disc of radius f tan(asin(R / (f + R))).
   */
  private worldZoom(lat = WORLD_CENTER[1]): number {
    const el = this.map.getContainer()
    if (!this.globe) {
      if (!matchMedia(PHONE).matches) return WORLD_ZOOM
      return Math.min(WORLD_ZOOM, Math.log2(el.clientWidth / WORLD_PX_Z0))
    }
    const disc = GLOBE_FILL * Math.min(el.clientWidth, el.clientHeight)
    const f = el.clientHeight / 2 / Math.tan((this.map.getVerticalFieldOfView() * Math.PI) / 360)
    const sin = disc / Math.hypot(f, disc)
    const radius = (f * sin) / (1 - sin)
    const worldPx = 2 * Math.PI * radius * Math.cos((lat * Math.PI) / 180)
    return Math.max(this.map.getMinZoom(), Math.log2(worldPx / WORLD_PX_Z0))
  }

  /**
   * Fit the answer (with a country's outline) and a paint layer's cells into
   * view, with a sensible zoom cap; just the answer when both won't fit.
   */
  fitAnswerAndPaint(
    answer: LatLon,
    paint: GeoJSON.FeatureCollection,
    toleranceKm: number,
    outline: GeoJSON.Feature[] = []
  ): void {
    // Always at least two tolerances around the answer.
    const dLat = (2 * toleranceKm) / 111
    const dLon = dLat / Math.max(0.2, Math.cos((answer.lat * Math.PI) / 180))
    const around: Box = [answer.lon - dLon, answer.lat - dLat, answer.lon + dLon, answer.lat + dLat]
    const answerBox = boxAround(outline, around)
    const box = boxAround(paint.features, answerBox)
    const padding = this.revealPadding()
    if (box[2] - box[0] > 300) {
      // Spans most of the world; just show it all, at the answer's latitude in case the world is taller than the view.
      const zoom = this.globe ? this.worldZoom(20) : this.map.getMinZoom()
      const lat = this.globe ? 20 : answer.lat
      void this.map.easeTo({ center: [answer.lon, lat], zoom, offset: offsetFor(padding), duration: 900 })
      return
    }
    const camera = this.map.cameraForBounds(bounds(box), { padding, maxZoom: 10 })
    // Too wide even zoomed right out, as paint far off can be on a phone: the answer matters more.
    const fits = camera !== undefined && (camera.zoom ?? 0) >= this.map.getMinZoom()
    void this.map.fitBounds(bounds(fits ? box : answerBox), { padding, duration: 900, maxZoom: 10 })
  }

  /** Frame a country's outline (GeoJSON MultiPolygon coordinates) together with paint. */
  fitRegionAndPaint(
    answer: LatLon,
    outline: number[][][][],
    paint: GeoJSON.FeatureCollection,
    toleranceKm: number
  ): void {
    const parts = outline.map((coordinates): GeoJSON.Feature => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates }
    }))
    this.fitAnswerAndPaint(answer, paint, toleranceKm, parts)
  }

  /**
   * Where the reveal's cards leave the map clear: between the cards on the
   * left and right and above the toolbar, or on a phone, between the
   * question card and the sheet.
   */
  private revealPadding(): Required<maplibregl.PaddingOptions> {
    const { clientWidth: w, clientHeight: h } = this.map.getContainer()
    if (matchMedia(PHONE).matches) {
      // Below the header and the question card (--question-h, from the card).
      const card = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--question-h")) || 0
      return { top: 64 + card + 8, bottom: h * (1 - SHEET_TOP) + 16, left: 24, right: 24 }
    }
    // A narrow window has less room beside the cards than they take.
    const side = Math.min(340, w * 0.3)
    return { top: 40, bottom: 90, left: side, right: side }
  }

  /** Ease so that about eight tolerances span 40% of the viewport width. */
  focusOn(answer: LatLon, toleranceKm: number): void {
    const padding = this.revealPadding()
    const widthPx = this.map.getContainer().clientWidth
    const cos = Math.max(0.05, Math.cos((answer.lat * Math.PI) / 180))
    const targetMpp = (toleranceKm * 8 * 1000) / (0.4 * widthPx)
    const zoom = Math.log2((WORLD_M * cos) / (WORLD_PX_Z0 * targetMpp))
    void this.map.easeTo({
      center: [answer.lon, answer.lat],
      zoom: Math.min(this.map.getMaxZoom(), Math.max(this.map.getMinZoom(), zoom)),
      offset: offsetFor(padding),
      duration: 900
    })
  }
}

/** West, south, east, north. */
type Box = [number, number, number, number]

/** `box` grown to take in the polygons' outer rings. */
function boxAround(features: GeoJSON.Feature[], box: Box): Box {
  let [minLon, minLat, maxLon, maxLat] = box
  for (const f of features) {
    if (f.geometry.type !== "Polygon") continue
    for (const [lon, lat] of f.geometry.coordinates[0] as [number, number][]) {
      // Cells that were unwrapped past 180 are folded back for the bbox.
      const l = lon > 180 ? lon - 360 : lon
      if (l < minLon) minLon = l
      if (l > maxLon) maxLon = l
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  return [minLon, minLat, maxLon, maxLat]
}

function bounds([w, s, e, n]: Box): maplibregl.LngLatBoundsLike {
  return [
    [w, Math.max(-85, s)],
    [e, Math.min(85, n)]
  ]
}

/** Moves the centre into the middle of the clear part of the map. Unlike easeTo's padding, it does not stay set. */
function offsetFor(p: Required<maplibregl.PaddingOptions>): [number, number] {
  return [(p.left - p.right) / 2, (p.top - p.bottom) / 2]
}

/** A band as polygons: a longitude band across 180° is two, one each side. */
function drawable(lat: number): boolean {
  return Math.abs(lat) <= MAX_LAT
}

function hintFeatures(band: HintBand): GeoJSON.Feature[] {
  const box = (west: number, east: number, south: number, north: number): GeoJSON.Feature => ({
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south]
        ]
      ]
    }
  })
  const p = MAX_LAT
  if (band.axis === "latitude") return [box(-180, 180, Math.max(band.from, -p), Math.min(band.to, p))]
  if (band.from <= band.to) return [box(band.from, band.to, -p, p)]
  return [box(band.from, 180, -p, p), box(-180, band.to, -p, p)]
}
