import type { Degrees, Km, SquareKm } from "./units.ts"

/** Mean sphere. */
export const EARTH_RADIUS: Km = 6371.0

export interface LatLon {
  lat: Degrees
  lon: Degrees
}

/** [lon, lat] in degrees: GeoJSON's order, the reverse of LatLon. */
type LonLat = [lon: number, lat: number]
/** A closed loop of points. */
export type Ring = LonLat[]
/** An outer ring, then its holes. */
type Polygon = Ring[]
/** One polygon per separate piece of land. */
export type MultiPolygon = Polygon[]
/** West, south, east, north, in degrees. */
export type Box = [west: number, south: number, east: number, north: number]

/** Unit-free 3D position on the Earth sphere, in kilometres. */
export type Xyz = readonly [number, number, number]

export function toXyz({ lat, lon }: LatLon): Xyz {
  const la = (lat * Math.PI) / 180
  const lo = (lon * Math.PI) / 180
  const c = Math.cos(la)
  return [EARTH_RADIUS * c * Math.cos(lo), EARTH_RADIUS * c * Math.sin(lo), EARTH_RADIUS * Math.sin(la)]
}

/** Straight-line (chord) distance between two points on the sphere. */
export function chordDistance(a: Xyz, b: Xyz): Km {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function chordDistanceSq(a: Xyz, b: Xyz): SquareKm {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return dx * dx + dy * dy + dz * dz
}

/** Used only for display. */
export function greatCircleDistance(a: LatLon, b: LatLon): Km {
  const d = chordDistance(toXyz(a), toXyz(b))
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, d / (2 * EARTH_RADIUS)))
}

/** The point on the sphere in the direction of `v` (any length). */
export function fromXyz(v: Xyz): LatLon {
  const r = Math.hypot(v[0], v[1], v[2])
  return { lat: (Math.asin(v[2] / r) * 180) / Math.PI, lon: (Math.atan2(v[1], v[0]) * 180) / Math.PI }
}

/** Initial bearing from `a` to `b`, clockwise from north. */
export function bearing(a: LatLon, b: LatLon): Degrees {
  const r = Math.PI / 180
  const dLon = (b.lon - a.lon) * r
  const y = Math.sin(dLon) * Math.cos(b.lat * r)
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}
