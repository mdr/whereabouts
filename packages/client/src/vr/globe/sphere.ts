/**
 * Points on the VR globe in its own space, unit radius, matching how three's
 * SphereGeometry lays an equirectangular texture: longitude 0 on +X, 90°E on
 * -Z, the north pole on +Y.
 */
import { Vector3 } from "three"
import { toDegrees, toRadians, type LatLon } from "@whereabouts/shared/geo"
import type { Metres } from "@whereabouts/shared/units"

export function latLonToLocal({ lat, lon }: LatLon, out = new Vector3()): Vector3 {
  const [la, lo] = [toRadians(lat), toRadians(lon)]
  const c = Math.cos(la)
  return out.set(c * Math.cos(lo), Math.sin(la), -c * Math.sin(lo))
}

export function localToLatLon(v: Vector3): LatLon {
  const n = v.length()
  return { lat: toDegrees(Math.asin(Math.max(-1, Math.min(1, v.y / n)))), lon: toDegrees(Math.atan2(-v.z, v.x)) }
}

/** Distance along a ray to where it first meets a sphere, or undefined if it misses or starts inside. */
export function raySphere(origin: Vector3, dir: Vector3, centre: Vector3, radius: Metres): Metres | undefined {
  const ox = origin.x - centre.x
  const oy = origin.y - centre.y
  const oz = origin.z - centre.z
  const b = ox * dir.x + oy * dir.y + oz * dir.z
  const c = ox * ox + oy * oy + oz * oz - radius * radius
  if (c < 0) return undefined
  const disc = b * b - c
  if (disc < 0) return undefined
  const t = -b - Math.sqrt(disc)
  return t >= 0 ? t : undefined
}
