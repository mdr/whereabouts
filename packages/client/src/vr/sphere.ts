/**
 * Points on the VR globe in its own space, unit radius, matching how three's
 * SphereGeometry lays an equirectangular texture: longitude 0 on +X, 90°E on
 * -Z, the north pole on +Y.
 */
import { Vector3 } from "three"
import type { LatLon } from "@whereabouts/shared"

const RAD = Math.PI / 180

export function latLonToLocal({ lat, lon }: LatLon, out = new Vector3()): Vector3 {
  const c = Math.cos(lat * RAD)
  return out.set(c * Math.cos(lon * RAD), Math.sin(lat * RAD), -c * Math.sin(lon * RAD))
}

export function localToLatLon(v: Vector3): LatLon {
  const n = v.length()
  return { lat: Math.asin(Math.max(-1, Math.min(1, v.y / n))) / RAD, lon: Math.atan2(-v.z, v.x) / RAD }
}

/** Distance along a ray to where it first meets a sphere, or undefined if it misses or starts inside. */
export function raySphere(origin: Vector3, dir: Vector3, centre: Vector3, radius: number): number | undefined {
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
