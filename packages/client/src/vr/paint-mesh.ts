/**
 * The paint on the VR globe as geometry, one coloured fan per cell, so it
 * stays as sharp as the cells themselves at any zoom.
 */
import { BufferAttribute, BufferGeometry, Color, SRGBColorSpace, Vector3 } from "three"
import type { Theme } from "../themes"
import { latLonToLocal } from "./sphere"

const c = new Color()
const p = new Vector3()
const mid = new Vector3()

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** The map's paint ramp (see GameMap.applyPaintRamp): colour stops at 0, ⅓, ⅔ and 1, mixed as the map mixes them. */
function rampColour(theme: Theme, v: number, out: Color): number {
  const t = Math.min(1, Math.max(0, v)) * 3
  const i = Math.min(2, Math.floor(t))
  const a = rgb(theme.ramp[i]!)
  const b = rgb(theme.ramp[i + 1]!)
  const [r, g, bl] = a.map((x, k) => x + (b[k]! - x) * (t - i)) as [number, number, number]
  out.setRGB(r, g, bl, SRGBColorSpace)
  const [o0, o1] = theme.rampOpacity
  return o0 + (o1 - o0) * v
}

export function paintGeometry(
  paint: GeoJSON.FeatureCollection<GeoJSON.Polygon, { v: number }>,
  theme: Theme,
  radius: number
): BufferGeometry {
  const rings = paint.features.map((f) => {
    const ring = f.geometry.coordinates[0]!
    const [first, last] = [ring[0]!, ring[ring.length - 1]!]
    return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring
  })
  const vertices = rings.reduce((n, r) => n + r.length + 1, 0)
  const triangles = rings.reduce((n, r) => n + r.length, 0)
  const position = new Float32Array(vertices * 3)
  const colour = new Float32Array(vertices * 4)
  const index = new Uint32Array(triangles * 3)
  let vi = 0
  let ii = 0
  paint.features.forEach((f, k) => {
    const ring = rings[k]!
    const alpha = rampColour(theme, f.properties.v, c)
    const centre = vi
    const put = (q: Vector3) => {
      q.normalize()
        .multiplyScalar(radius)
        .toArray(position, vi * 3)
      colour.set([c.r, c.g, c.b, alpha], vi * 4)
      vi++
    }
    mid.set(0, 0, 0)
    for (const [lon, lat] of ring) mid.add(latLonToLocal({ lat: lat!, lon: lon! }, p))
    put(mid)
    for (const [lon, lat] of ring) put(latLonToLocal({ lat: lat!, lon: lon! }, p))
    for (let i = 0; i < ring.length; i++) {
      index[ii++] = centre
      index[ii++] = centre + 1 + i
      index[ii++] = centre + 1 + ((i + 1) % ring.length)
    }
  })
  const g = new BufferGeometry()
  g.setAttribute("position", new BufferAttribute(position, 3))
  g.setAttribute("color", new BufferAttribute(colour, 4))
  g.setIndex(new BufferAttribute(index, 1))
  return g
}
