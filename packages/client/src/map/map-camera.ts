import type { LatLon, LonLat } from "@whereabouts/shared/geo"
import type { Outline } from "@whereabouts/shared/questions"
import type { Degrees, Km, Px, Zoom } from "@whereabouts/shared/units"
import type { Map as MapLibreMap, PaddingOptions } from "maplibre-gl"
import {
  boxAround,
  bounds,
  globeWorldZoom,
  metresPerPixel,
  offsetFor,
  toleranceBox,
  zoomForWorldWidth
} from "./map-geometry"

export const WORLD_CENTER: LonLat = [10, 25]
export const WORLD_ZOOM: Zoom = 1.6
/** The phone layout's width, and where its reveal sheet starts, as a share of the screen's height (media.css --phone, Hud.module.css). */
const PHONE_MEDIA_QUERY = "(max-width: 640px)"
const SHEET_TOP = 0.5

/** The flat map's zoom that shows the whole world on a map `width` px wide. */
export const flatWorldZoom = (width: Px): Zoom =>
  matchMedia(PHONE_MEDIA_QUERY).matches ? Math.min(WORLD_ZOOM, zoomForWorldWidth(width)) : WORLD_ZOOM

/**
 * Where the reveal's cards leave the map clear: between the cards on the
 * left and right and above the toolbar, or on a phone, between the
 * question card and the sheet.
 */
export const revealPadding = ({
  width,
  height,
  phone,
  questionCardHeight
}: {
  width: Px
  height: Px
  phone: boolean
  questionCardHeight: Px
}): Required<PaddingOptions> => {
  if (phone) {
    // Below the header and the question card.
    return { top: 64 + questionCardHeight + 8, bottom: height * (1 - SHEET_TOP) + 16, left: 24, right: 24 }
  }
  // A narrow window has less room beside the cards than they take.
  const side = Math.min(340, width * 0.3)
  return { top: 40, bottom: 90, left: side, right: side }
}

/** Projection and framing: the whole-world view, and fitting the reveal into the room the cards leave. */
export class MapCamera {
  private globe = false
  /** Set once the map is removed; camera moves become no-ops rather than throwing. */
  private disposed = false

  constructor(private readonly map: MapLibreMap) {}

  dispose(): void {
    this.disposed = true
  }

  /** A phone is too narrow for the usual view to show the whole world. */
  fitWorldToPhone(): void {
    if (!matchMedia(PHONE_MEDIA_QUERY).matches) return
    const zoom = this.worldZoom()
    this.map.setMinZoom(Math.min(1, zoom))
    this.map.jumpTo({ zoom })
  }

  /** Switch between the flat map and the globe, keeping a whole-world view whole. */
  setGlobe(on: boolean): void {
    if (this.disposed || on === this.globe) return
    const wasWhole = this.map.getZoom() < this.worldZoom() + 0.5
    this.globe = on
    this.map.setProjection({ type: on ? "globe" : "mercator" })
    if (wasWhole) this.resetView()
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
    const padding = this.padding()
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

  private padding(): Required<PaddingOptions> {
    const { clientWidth: width, clientHeight: height } = this.map.getContainer()
    // The question card's height, from --question-h.
    const questionCardHeight =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--question-h")) || 0
    return revealPadding({ width, height, phone: matchMedia(PHONE_MEDIA_QUERY).matches, questionCardHeight })
  }
}
