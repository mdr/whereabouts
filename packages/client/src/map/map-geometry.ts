import type { LngLatBoundsLike, PaddingOptions } from "maplibre-gl"
import { HintAxis, type HintBand } from "@whereabouts/shared/hints"
import type { Box, LatLon, Ring } from "@whereabouts/shared/geo"
import type { Km, Metres, Px } from "@whereabouts/shared/units"

/** World circumference at the equator in metres, for metres-per-pixel maths. */
const EQUATOR: Metres = 40075016.686
/** MapLibre's world is 512 px wide at zoom 0. */
export const WORLD_PX_Z0 = 512
/**
 * MapLibre's tiles stop this far north and south. Paint beyond it is never
 * seen on the flat map, and a globe smears it into a fan at the pole.
 */
export const MAX_LAT = 85.0511
/** The globe's starting size: its radius as a share of the map's shorter side. */
const GLOBE_FILL = 0.4

export function drawable(lat: number): boolean {
  return Math.abs(lat) <= MAX_LAT
}

/** A band as polygons: a longitude band across 180° is two, one each side. */
export function hintFeatures(band: HintBand): GeoJSON.Feature[] {
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
  if (band.axis === HintAxis.LATITUDE) return [box(-180, 180, Math.max(band.from, -p), Math.min(band.to, p))]
  if (band.from <= band.to) return [box(band.from, band.to, -p, p)]
  return [box(band.from, 180, -p, p), box(-180, band.to, -p, p)]
}

function outerRingPoints(features: GeoJSON.Feature[]): Ring {
  return features.flatMap((f) => (f.geometry.type === "Polygon" ? (f.geometry.coordinates[0] as Ring) : []))
}

/** `box` grown to take in the polygons' outer rings. */
export function boxAround(features: GeoJSON.Feature[], box: Box): Box {
  let [minLon, minLat, maxLon, maxLat] = box
  for (const [lon, lat] of outerRingPoints(features)) {
    // Cells that were unwrapped past 180 are folded back for the bbox.
    const l = lon > 180 ? lon - 360 : lon
    if (l < minLon) minLon = l
    if (l > maxLon) maxLon = l
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return [minLon, minLat, maxLon, maxLat]
}

/** Always at least two tolerances around the answer. */
export function toleranceBox(answer: LatLon, tolerance: Km): Box {
  const dLat = (2 * tolerance) / 111
  const dLon = dLat / Math.max(0.2, Math.cos((answer.lat * Math.PI) / 180))
  return [answer.lon - dLon, answer.lat - dLat, answer.lon + dLon, answer.lat + dLat]
}

export function bounds([w, s, e, n]: Box): LngLatBoundsLike {
  return [
    [w, Math.max(-85, s)],
    [e, Math.min(85, n)]
  ]
}

/** Moves the centre into the middle of the clear part of the map. Unlike easeTo's padding, it does not stay set. */
export function offsetFor(p: Required<PaddingOptions>): [x: Px, y: Px] {
  return [(p.left - p.right) / 2, (p.top - p.bottom) / 2]
}

export function metresPerPixel(lat: number, zoom: number): number {
  return (EQUATOR * Math.cos((lat * Math.PI) / 180)) / (WORLD_PX_Z0 * Math.pow(2, zoom))
}

/**
 * The zoom that shows a whole globe sized to the map. In the camera's
 * perspective a sphere of radius R px, seen from f px away, shows a disc of
 * radius f tan(asin(R / (f + R))).
 */
export function globeWorldZoom(width: number, height: number, fovDegrees: number, lat: number): number {
  const disc = GLOBE_FILL * Math.min(width, height)
  const f = height / 2 / Math.tan((fovDegrees * Math.PI) / 360)
  const sin = disc / Math.hypot(f, disc)
  const radius = (f * sin) / (1 - sin)
  const worldWidth = 2 * Math.PI * radius * Math.cos((lat * Math.PI) / 180)
  return Math.log2(worldWidth / WORLD_PX_Z0)
}
