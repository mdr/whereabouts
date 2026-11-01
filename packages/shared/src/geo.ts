import type { Degrees, Km, Radians, SquareKm } from "./units.ts"

/** Mean sphere. */
export const EARTH_RADIUS: Km = 6371.0

export interface LatLon {
  lat: Degrees
  lon: Degrees
}

/** [lon, lat] in degrees: GeoJSON's order, the reverse of LatLon. */
export type LonLat = [lon: Degrees, lat: Degrees]
/** A closed loop of points. */
export type Ring = LonLat[]
/** An outer ring, then its holes. */
type Polygon = Ring[]
/** One polygon per separate piece of land. */
export type MultiPolygon = Polygon[]
/** West, south, east, north, in degrees. */
export type Box = [west: Degrees, south: Degrees, east: Degrees, north: Degrees]

/** 3D position on the Earth sphere. */
export type Xyz = readonly [x: Km, y: Km, z: Km]

export function toRadians(d: Degrees): Radians {
  return (d * Math.PI) / 180
}

export function toDegrees(r: Radians): Degrees {
  return (r * 180) / Math.PI
}

/** Degrees of arc along a great circle that span `km` on the ground. */
export function kmToDegrees(km: Km): Degrees {
  return km / ((EARTH_RADIUS * Math.PI) / 180)
}

export function toXyz({ lat, lon }: LatLon): Xyz {
  const la = toRadians(lat)
  const lo = toRadians(lon)
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
  return { lat: toDegrees(Math.asin(v[2] / r)), lon: toDegrees(Math.atan2(v[1], v[0])) }
}

/** Initial bearing from `a` to `b`, clockwise from north. */
export function bearing(a: LatLon, b: LatLon): Degrees {
  const dLon = toRadians(b.lon - a.lon)
  const [latA, latB] = [toRadians(a.lat), toRadians(b.lat)]
  const y = Math.sin(dLon) * Math.cos(latB)
  const x = Math.cos(latA) * Math.sin(latB) - Math.sin(latA) * Math.cos(latB) * Math.cos(dLon)
  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}
