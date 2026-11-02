import type { CssColour } from "@whereabouts/shared/colours"
import { Map as MapLibreMap, NavigationControl, setWorkerUrl, type Point, type GeoJSONSource } from "maplibre-gl"
import type * as maplibregl from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
// MapLibre resolves its module worker as a sibling of its own script via
// import.meta.url. After bundling that points into /assets where no such
// file exists, so hand it a worker Vite has bundled and knows the URL of.
import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"
export { mapWorkerUrl }
import { cellBoundaryLatLng, type H3Cell } from "@whereabouts/shared/h3"
import { cellsOutline } from "@whereabouts/shared/paint/cell-outline"
import type { HintBand } from "@whereabouts/shared/hints"
import type { LatLon } from "@whereabouts/shared/geo"
import type { Outline } from "@whereabouts/shared/questions"
import type { Theme } from "./themes"
import { DetailLayers } from "./detail-layers"
import { addGameLayers, CURSOR_SOURCE, HINT_SOURCE, PAINT_FILL, PAINT_SOURCE, REVEAL_SOURCE } from "./map-layers"
import { MapCamera, WORLD_CENTER, WORLD_ZOOM } from "./map-camera"
import { applyPaint, setPaint, type PaintSetting } from "./map-paint"
import { overlayPaint, paintRamp, PLAYER_OPACITY } from "./map-theme"
import { drawable, hintFeatures } from "./map-geometry"

setWorkerUrl(mapWorkerUrl)

export const STYLE_URL = "https://tiles.openfreemap.org/styles/positron"

export class GameMap {
  readonly map: MapLibreMap
  readonly ready: Promise<void>
  /** Which of the style's layers show. */
  readonly detail: DetailLayers
  /** The whole-world view, framing and the projection. */
  readonly camera: MapCamera
  private theme: Theme | undefined = undefined
  /** Set once the map is removed; the hint becomes a no-op rather than throwing. */
  private disposed = false

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
    this.detail = new DetailLayers(this.map)
    this.camera = new MapCamera(this.map)
    if (options.zoom === undefined) this.camera.fitWorldToPhone()
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
        this.detail.index(this.map.getStyle())
        addGameLayers(this.map, [...this.detail.labels], this.theme)
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

  applyTheme(theme: Theme): void {
    this.theme = theme
    this.detail.applyTheme(theme)
    this.applyPaintRamp(theme)
    for (const setting of overlayPaint(theme)) this.setPaintIfPresent(setting)
    document.documentElement.style.setProperty("--ring-brush", theme.brush)
  }

  private setPaintIfPresent(setting: PaintSetting): void {
    if (this.map.getLayer(setting.layer)) applyPaint(this.map, setting)
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
    this.detail.dispose()
    this.camera.dispose()
    this.map.remove()
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

  /** A region answer: the outline (GeoJSON MultiPolygon coordinates), filled faintly, and any disputed land, which is not scored. */
  showRegionReveal(outline: Outline, disputed?: Outline): void {
    const features: GeoJSON.Feature[] = [
      { type: "Feature", properties: {}, geometry: { type: "MultiPolygon", coordinates: outline } }
    ]
    if (disputed)
      features.push({
        type: "Feature",
        properties: { disputed: true },
        geometry: { type: "MultiPolygon", coordinates: disputed }
      })
    void this.source(REVEAL_SOURCE)?.setData({ type: "FeatureCollection", features })
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
}
