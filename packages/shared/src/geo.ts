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
export type Polygon = Ring[]
/** One polygon per separate piece of land. */
export type MultiPolygon = Polygon[]
/** West, south, east, north, in degrees. */
export type Box = [west: Degrees, south: Degrees, east: Degrees, north: Degrees]

/** The box around polygons' outer rings. */
export const boxAround = (polygons: MultiPolygon): Box => {
  const points = polygons.flatMap((polygon) => polygon[0]!)
  const lons = points.map(([lon]) => lon)
  const lats = points.map(([, lat]) => lat)
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)]
}

export const inBox = ([west, south, east, north]: Box, { lat, lon }: LatLon): boolean =>
  lon >= west && lat >= south && lon <= east && lat <= north

/** Whether a point is inside a polygon: inside an odd number of its rings. */
export const insidePolygon = (polygon: Polygon, { lat, lon }: LatLon): boolean => {
  let odd = false
  for (const ring of polygon)
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[i]!
      const [x2, y2] = ring[j]!
      if (y1 > lat !== y2 > lat && lon < x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1)) odd = !odd
    }
  return odd
}

/** 3D position on the Earth sphere. */
export type Xyz = readonly [x: Km, y: Km, z: Km]

export const toRadians = (degrees: Degrees): Radians => (degrees * Math.PI) / 180

export const toDegrees = (radians: Radians): Degrees => (radians * 180) / Math.PI

/** Degrees of arc along a great circle that span `km` on the ground. */
export const kmToDegrees = (km: Km): Degrees => km / ((EARTH_RADIUS * Math.PI) / 180)

export const toXyz = ({ lat, lon }: LatLon): Xyz => {
  const latRadians = toRadians(lat)
  const lonRadians = toRadians(lon)
  const cosLat = Math.cos(latRadians)
  return [
    EARTH_RADIUS * cosLat * Math.cos(lonRadians),
    EARTH_RADIUS * cosLat * Math.sin(lonRadians),
    EARTH_RADIUS * Math.sin(latRadians)
  ]
}

/** Straight-line (chord) distance between two points on the sphere. */
export const chordDistance = (a: Xyz, b: Xyz): Km => {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export const chordDistanceSq = (a: Xyz, b: Xyz): SquareKm => {
  const dx = a[0] - b[0]
  const dy = a[1] - b[1]
  const dz = a[2] - b[2]
  return dx * dx + dy * dy + dz * dz
}

/** Used only for display. */
export const greatCircleDistance = (a: LatLon, b: LatLon): Km => {
  const chord = chordDistance(toXyz(a), toXyz(b))
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, chord / (2 * EARTH_RADIUS)))
}

/** The point on the sphere in the direction of `xyz` (any length). */
export const fromXyz = (xyz: Xyz): LatLon => {
  const radius = Math.hypot(xyz[0], xyz[1], xyz[2])
  return { lat: toDegrees(Math.asin(xyz[2] / radius)), lon: toDegrees(Math.atan2(xyz[1], xyz[0])) }
}

/** Initial bearing from `a` to `b`, clockwise from north. */
export const bearing = (a: LatLon, b: LatLon): Degrees => {
  const dLon = toRadians(b.lon - a.lon)
  const [latA, latB] = [toRadians(a.lat), toRadians(b.lat)]
  const y = Math.sin(dLon) * Math.cos(latB)
  const x = Math.cos(latA) * Math.sin(latB) - Math.sin(latA) * Math.cos(latB) * Math.cos(dLon)
  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}
