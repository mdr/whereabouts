import type { CssColour } from "@whereabouts/shared/colours"
import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type IControl,
  type Point,
  type GeoJSONSource
} from "maplibre-gl"
import type * as maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
// MapLibre resolves its module worker as a sibling of its own script via
// import.meta.url. After bundling that points into /assets where no such
// file exists, so hand it a worker Vite has bundled and knows the URL of.
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
export { mapWorkerUrl }
import { cellBoundaryLatLng, type H3Cell } from "@whereabouts/shared/h3"
import { cellsOutline } from "@whereabouts/shared/paint/paint"
import type { HintBand } from "@whereabouts/shared/hints"
import type { LatLon, LonLat } from "@whereabouts/shared/geo"
import type { Outline } from "@whereabouts/shared/questions"
import type { Theme } from "./themes"
import {
  addGameLayers,
  type BorderPaint,
  COLOUR_LAYER,
  CURSOR_SOURCE,
  HINT_SOURCE,
  PAINT_FILL,
  PAINT_SOURCE,
  REVEAL_BORDER_OPACITY,
  REVEAL_BORDER_WIDTH,
  REVEAL_SOURCE,
  STATE_BORDERS,
  STATE_LABELS,
  TERRAIN_LAYER
} from "./map-layers"
import { applyPaint, setPaint, type LayerId, type PaintSetting } from "./map-paint"
import { overlayPaint, paintRamp, PLAYER_OPACITY, styleLayerPaint, type StyleLayer } from "./map-theme"
import {
  boxAround,
  bounds,
  drawable,
  globeWorldZoom,
  hintFeatures,
  metresPerPixel,
  zoomForWorldWidth,
  offsetFor,
  toleranceBox
} from "./map-geometry"
import {
  RevealDetail,
  showsBorders,
  showsInlandWater,
  showsPlaces,
  showsTerrain,
  type ShownDetail
} from "./shown-detail"
import type { Degrees, Km, Px, Zoom } from "@whereabouts/shared/units"

setWorkerUrl(mapWorkerUrl)

export const STYLE_URL = "https://tiles.openfreemap.org/styles/positron"
const WORLD_CENTER: LonLat = [10, 25]
const WORLD_ZOOM: Zoom = 1.6
/** The phone layout's width, and where its reveal sheet starts, as a share of the screen's height (media.css --phone, Hud.module.css). */
const PHONE_MEDIA_QUERY = "(max-width: 640px)"
const SHEET_TOP = 0.5

/**
 * National borders on the reveal: opaque and wider as the map zooms in, but
 * thinner and dimmer at world zoom, where they would crowd the map (and the
 * low-zoom data traces some coasts). While guessing they keep the style's
 * faint look, so the Political map detail stays a light hint.
 */
const NATIONAL_BORDERS = ["boundary_2", "boundary_disputed"]
/** Town and city names, hidden at a state reveal so the state names stand out. */
const PLACE_LABELS = ["label_other", "label_village", "label_town", "label_state", "label_city", "label_city_capital"]

/** The flat map's zoom that shows the whole world on a map `width` px wide. */
export function flatWorldZoom(width: Px): Zoom {
  return matchMedia(PHONE_MEDIA_QUERY).matches ? Math.min(WORLD_ZOOM, zoomForWorldWidth(width)) : WORLD_ZOOM
}

export class GameMap {
  readonly map: MapLibreMap
  readonly ready: Promise<void>
  private labelLayers: string[] = []
  private borderLayers: LayerId<"line">[] = []
  /** The style's own width and opacity for the national borders, restored after the reveal. */
  private borderPaint = new Map<LayerId<"line">, BorderPaint>()
  private revealBorders = false
  /** Roads, railways, buildings, airports, urban land use: man-made hints. */
  private roadLayers: string[] = []
  private urbanLayers: string[] = []
  private iceLayers: string[] = []
  private woodLayers: string[] = []
  /** River lines; lakes are handled by filtering the shared water layer. */
  private waterwayLayers: string[] = []
  private waterFilter: unknown = undefined
  private styleLayers: StyleLayer[] = []
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
    if (options.zoom === undefined && matchMedia(PHONE_MEDIA_QUERY).matches) {
      const zoom = this.worldZoom()
      this.map.setMinZoom(Math.min(1, zoom))
      this.map.jumpTo({ zoom })
    }
    // Bottom-left keeps the buttons clear of the HUD cards and the toolbar.
    this.map.addControl(new NavigationControl({ showCompass: false }), "bottom-left")
    this.map.keyboard.disableRotation()
    this.map.touchZoomRotate.disableRotation()
    this.ready = new Promise((resolve, reject) => {
      // Without its style the map never loads. Other errors (a tile, the
      // sprite) come after the style or do not hold the map back.
      let styled = false
      this.map.once("style.load", () => (styled = true))
      this.map.on("error", (event) => {
        if (!styled) reject(new Error("the map style did not load", { cause: event.error }))
      })
      this.map.once("load", () => {
        this.collapseAttribution()
        this.indexStyleLayers()
        addGameLayers(this.map, this.labelLayers, this.theme)
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
    const attribution = this.map.getContainer().querySelector(".maplibregl-ctrl-attrib")
    if (!attribution) return
    attribution.classList.remove("maplibregl-compact-show")
    attribution.removeAttribute("open")
  }

  private indexStyleLayers(): void {
    const layers = this.map.getStyle().layers
    const roadSources = new Set(["transportation", "aeroway"])
    const urbanSources = new Set(["building", "landuse", "park"])
    for (const layer of layers) {
      const sourceLayer = "source-layer" in layer ? (layer["source-layer"] ?? "") : ""
      this.styleLayers.push({ id: layer.id, type: layer.type, sourceLayer })
      if (layer.type === "symbol") this.labelLayers.push(layer.id)
      else if (layer.id.startsWith("boundary")) {
        this.borderLayers.push(layer.id)
        if (NATIONAL_BORDERS.includes(layer.id))
          this.borderPaint.set(layer.id, {
            width: this.map.getPaintProperty(layer.id, "line-width"),
            opacity: this.map.getPaintProperty(layer.id, "line-opacity")
          })
      } else if (roadSources.has(sourceLayer)) this.roadLayers.push(layer.id)
      else if (urbanSources.has(sourceLayer)) this.urbanLayers.push(layer.id)
      else if (sourceLayer === "waterway") this.waterwayLayers.push(layer.id)
      // Glaciers and ice shelves: they trace mountain ranges and polar coasts.
      else if (layer.id === "landcover_wood") this.woodLayers.push(layer.id)
      else if (layer.id.startsWith("landcover_")) this.iceLayers.push(layer.id)
      else if (layer.id === "water") this.waterFilter = this.map.getFilter("water")
    }
  }

  applyTheme(theme: Theme): void {
    this.theme = theme
    for (const setting of this.styleLayers.flatMap((layer) => styleLayerPaint(layer, theme)))
      this.setPaintIfPresent(setting)
    this.styleBorders()
    this.applyPaintRamp(theme)
    for (const setting of overlayPaint(theme)) this.setPaintIfPresent(setting)
    document.documentElement.style.setProperty("--ring-brush", theme.brush)
  }

  private setPaintIfPresent(setting: PaintSetting): void {
    if (this.map.getLayer(setting.layer)) applyPaint(this.map, setting)
  }

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
    button.dataset["testid"] = testId
    button.innerHTML = '<span class="maplibregl-ctrl-icon" aria-hidden="true"></span>'
    button.addEventListener("click", onToggle)
    this.globeButton = button
    this.showGlobeButton()
    const control: IControl = {
      onAdd: () => {
        const control = document.createElement("div")
        control.className = "maplibregl-ctrl maplibregl-ctrl-group globe-ctrl"
        control.append(button)
        return control
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

  /**
   * Tear the map down. Effects that unmount alongside the map (the reveal
   * turning borders back off, say) may still call the toggles afterwards;
   * MapLibre throws on a removed map, so they check `disposed` first.
   */
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
   * RevealDetail.REVEAL for everything but roads (they clutter at the zooms the
   * reveal uses). Place names and man-made detail show only on the reveal.
   */
  setDetail(level: ShownDetail): void {
    this.setInlandWater(showsInlandWater(level))
    this.setTerrain(showsTerrain(level))
    this.setIce(showsTerrain(level))
    this.setWood(showsTerrain(level))
    this.setBorders(showsBorders(level), showsPlaces(level))
    this.setRevealBorders(level === RevealDetail.REVEAL)
    this.setLabels(showsPlaces(level))
    this.setUrban(showsPlaces(level))
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
      setPaint(this.map, id, "line-color", bold ? this.theme.revealBorder : this.theme.border)
      if (!own) continue
      setPaint(this.map, id, "line-width", bold ? REVEAL_BORDER_WIDTH : own.width)
      setPaint(this.map, id, "line-opacity", bold ? REVEAL_BORDER_OPACITY : own.opacity)
    }
  }

  private source(id: string): GeoJSONSource | undefined {
    return this.map.getSource(id)
  }

  showPaint(data: GeoJSON.FeatureCollection): void {
    const features = data.features.filter(
      ({ geometry }) =>
        geometry.type !== "Polygon" || geometry.coordinates.every((ring) => ring.every(([, lat]) => drawable(lat!)))
    )
    void this.source(PAINT_SOURCE)?.setData({ ...data, features })
  }

  /** Outline the cells the next stamp would touch; undefined hides it. Dotted when erasing. */
  setCursorFootprint(cells: H3Cell[] | undefined, erase = false): void {
    const shown = cells?.filter((cell) => cellBoundaryLatLng(cell).every(([lat]) => drawable(lat)))
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
  setPaintColour(colour: CssColour | undefined): void {
    if (!this.map.getLayer(PAINT_FILL)) return
    if (colour === undefined) {
      if (this.theme) this.applyPaintRamp(this.theme)
      return
    }
    setPaint(this.map, PAINT_FILL, "fill-color", colour)
    setPaint(this.map, PAINT_FILL, "fill-opacity", PLAYER_OPACITY)
  }

  /** Colour each feature by its own `colour` property, for several players at once. */
  setPaintColourPerFeature(): void {
    if (!this.map.getLayer(PAINT_FILL)) return
    setPaint(this.map, PAINT_FILL, "fill-color", ["coalesce", ["get", "colour"], "#888888"])
    setPaint(this.map, PAINT_FILL, "fill-opacity", PLAYER_OPACITY)
  }

  private applyPaintRamp(theme: Theme): void {
    if (!this.map.getLayer(PAINT_FILL)) return
    const ramp = paintRamp(theme)
    setPaint(this.map, PAINT_FILL, "fill-color", ramp.color)
    setPaint(this.map, PAINT_FILL, "fill-opacity", ramp.opacity)
  }

  /** Marker at the answer: one clear dot. */
  showReveal(answer: LatLon): void {
    const collection: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [answer.lon, answer.lat] }
        }
      ]
    }
    void this.source(REVEAL_SOURCE)?.setData(collection)
  }

  /** A region answer: the outline (GeoJSON MultiPolygon coordinates), filled faintly. */
  showRegionReveal(outline: Outline): void {
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
  pixelsToKm(px: Px, lat: Degrees): Km {
    return (px * metresPerPixel(this.globe ? this.map.getCenter().lat : lat, this.map.getZoom())) / 1000
  }

  /** Back to the whole-world starting view, e.g. at the start of a round. */
  resetView(): void {
    void this.map.easeTo({ center: WORLD_CENTER, zoom: this.worldZoom(), duration: 700 })
  }

  /** The zoom of the whole-world view. On a phone the flat map fits the world's width to the screen. */
  private worldZoom(lat: Degrees = WORLD_CENTER[1]): Zoom {
    const container = this.map.getContainer()
    if (!this.globe) return flatWorldZoom(container.clientWidth)
    const zoom = globeWorldZoom(container.clientWidth, container.clientHeight, this.map.getVerticalFieldOfView(), lat)
    return Math.max(this.map.getMinZoom(), zoom)
  }

  /**
   * Fit the answer (with a country's outline) and a paint layer's cells into
   * view, with a sensible zoom cap; just the answer when both won't fit.
   */
  fitAnswerAndPaint(
    answer: LatLon,
    paint: GeoJSON.FeatureCollection,
    tolerance: Km,
    outline: GeoJSON.Feature[] = []
  ): void {
    const answerBox = boxAround(outline, toleranceBox(answer, tolerance))
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
  fitRegionAndPaint(answer: LatLon, outline: Outline, paint: GeoJSON.FeatureCollection, tolerance: Km): void {
    const parts = outline.map((coordinates): GeoJSON.Feature => ({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates }
    }))
    this.fitAnswerAndPaint(answer, paint, tolerance, parts)
  }

  /**
   * Where the reveal's cards leave the map clear: between the cards on the
   * left and right and above the toolbar, or on a phone, between the
   * question card and the sheet.
   */
  private revealPadding(): Required<maplibregl.PaddingOptions> {
    const { clientWidth: width, clientHeight: height } = this.map.getContainer()
    if (matchMedia(PHONE_MEDIA_QUERY).matches) {
      // Below the header and the question card (--question-h, from the card).
      const card = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--question-h")) || 0
      return { top: 64 + card + 8, bottom: height * (1 - SHEET_TOP) + 16, left: 24, right: 24 }
    }
    // A narrow window has less room beside the cards than they take.
    const side = Math.min(340, width * 0.3)
    return { top: 40, bottom: 90, left: side, right: side }
  }
}
