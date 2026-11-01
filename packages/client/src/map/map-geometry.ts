import type { LngLatBoundsLike, PaddingOptions } from "maplibre-gl"
import { HintAxis, type HintBand } from "@whereabouts/shared/hints"
import { kmToDegrees, toRadians, type Box, type LatLon, type Ring } from "@whereabouts/shared/geo"
import type { Degrees, Km, Metres, Px, Zoom } from "@whereabouts/shared/units"

/** MapLibre's Web Mercator world width (the WGS84 equator), for metres-per-pixel maths. */
export const EQUATORIAL_CIRCUMFERENCE: Metres = 40075016.686
const WORLD_WIDTH_AT_ZOOM_0: Px = 512

/** How wide MapLibre draws the whole world at a zoom. */
function worldWidth(zoom: Zoom): Px {
  return WORLD_WIDTH_AT_ZOOM_0 * Math.pow(2, zoom)
}

/** The zoom at which the world is `width` px wide. */
export function zoomForWorldWidth(width: Px): Zoom {
  return Math.log2(width / WORLD_WIDTH_AT_ZOOM_0)
}
/**
 * MapLibre's tiles stop this far north and south. Paint beyond it is never
 * seen on the flat map, and a globe smears it into a fan at the pole.
 */
export const MAX_LAT: Degrees = 85.0511
export const MIN_LAT: Degrees = 0 - MAX_LAT
/** The globe's starting size: its radius as a share of the map's shorter side. */
const GLOBE_FILL = 0.4

export function drawable(lat: Degrees): boolean {
  return Math.abs(lat) <= MAX_LAT
}

/** A band as polygons: a longitude band across 180° is two, one each side. */
export function hintFeatures(band: HintBand): GeoJSON.Feature[] {
  const box = (west: Degrees, east: Degrees, south: Degrees, north: Degrees): GeoJSON.Feature => ({
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
  if (band.axis === HintAxis.LATITUDE) return [box(-180, 180, Math.max(band.from, MIN_LAT), Math.min(band.to, MAX_LAT))]
  if (band.from <= band.to) return [box(band.from, band.to, MIN_LAT, MAX_LAT)]
  return [box(band.from, 180, MIN_LAT, MAX_LAT), box(-180, band.to, MIN_LAT, MAX_LAT)]
}

function outerRingPoints(features: GeoJSON.Feature[]): Ring {
  return features.flatMap((feature) =>
    feature.geometry.type === "Polygon" ? (feature.geometry.coordinates[0] as Ring) : []
  )
}

/** `box` grown to take in the polygons' outer rings. */
export function boxAround(features: GeoJSON.Feature[], box: Box): Box {
  let [minLon, minLat, maxLon, maxLat] = box
  for (const [lon, lat] of outerRingPoints(features)) {
    // Cells that were unwrapped past 180 are folded back for the bbox.
    const folded = lon > 180 ? lon - 360 : lon
    if (folded < minLon) minLon = folded
    if (folded > maxLon) maxLon = folded
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return [minLon, minLat, maxLon, maxLat]
}

/** Always at least two tolerances around the answer. */
export function toleranceBox(answer: LatLon, tolerance: Km): Box {
  const dLat = kmToDegrees(2 * tolerance)
  const dLon = dLat / Math.max(0.2, Math.cos(toRadians(answer.lat)))
  return [answer.lon - dLon, answer.lat - dLat, answer.lon + dLon, answer.lat + dLat]
}

export function bounds([w, s, e, n]: Box): LngLatBoundsLike {
  return [
    [w, Math.max(-85, s)],
    [e, Math.min(85, n)]
  ]
}

/** Moves the centre into the middle of the clear part of the map. Unlike easeTo's padding, it does not stay set. */
export function offsetFor(padding: Required<PaddingOptions>): [x: Px, y: Px] {
  return [(padding.left - padding.right) / 2, (padding.top - padding.bottom) / 2]
}

/** The ground length of one CSS pixel. */
export function metresPerPixel(lat: Degrees, zoom: Zoom): Metres {
  return (EQUATORIAL_CIRCUMFERENCE * Math.cos(toRadians(lat))) / worldWidth(zoom)
}

/**
 * The zoom that shows a whole globe sized to the map. In the camera's
 * perspective a sphere of radius R px, seen from f px away, shows a disc of
 * radius f tan(asin(R / (f + R))).
 */
export function globeWorldZoom(width: Px, height: Px, fov: Degrees, lat: Degrees): Zoom {
  const disc = GLOBE_FILL * Math.min(width, height)
  const focalLength = height / 2 / Math.tan(toRadians(fov) / 2)
  const sin = disc / Math.hypot(focalLength, disc)
  const radius = (focalLength * sin) / (1 - sin)
  return zoomForWorldWidth(2 * Math.PI * radius * Math.cos(toRadians(lat)))
}
