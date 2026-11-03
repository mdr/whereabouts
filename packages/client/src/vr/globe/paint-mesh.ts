/**
 * The paint on the VR globe as geometry, one coloured fan per cell, so it
 * stays as sharp as the cells themselves at any zoom.
 */
import type { CssColour } from "@whereabouts/shared/colours"
import { BufferAttribute, BufferGeometry, Color, SRGBColorSpace, Vector3 } from "three"
import type { Theme } from "../../map/themes"
import { latLonToLocal } from "./sphere"
import type { Metres } from "@whereabouts/shared/units"

const c = new Color()
const p = new Vector3()
const mid = new Vector3()

const rgb = (hex: CssColour): [r: number, g: number, b: number] => {
  const packed = parseInt(hex.slice(1), 16)
  return [((packed >> 16) & 255) / 255, ((packed >> 8) & 255) / 255, (packed & 255) / 255]
}

/** The map's paint ramp (see GameMap.applyPaintRamp): colour stops at 0, ⅓, ⅔ and 1, mixed as the map mixes them. */
const rampColour = (theme: Theme, v: number, out: Color): number => {
  const t = Math.min(1, Math.max(0, v)) * 3
  const i = Math.min(2, Math.floor(t))
  const a = rgb(theme.ramp[i]!)
  const b = rgb(theme.ramp[i + 1]!)
  const [r, g, bl] = a.map((x, k) => x + (b[k]! - x) * (t - i)) as [r: number, g: number, b: number]
  out.setRGB(r, g, bl, SRGBColorSpace)
  const [o0, o1] = theme.rampOpacity
  return o0 + (o1 - o0) * v
}

/**
 * A cell in a player's colour (its own, or `colour` for all) shows as the
 * map shows one (GameMap.setPaintColour): more opaque the heavier it is.
 */
export const paintGeometry = (
  paint: GeoJSON.FeatureCollection<GeoJSON.Polygon, { v: number; colour?: CssColour }>,
  theme: Theme,
  radius: Metres,
  colour?: CssColour
): BufferGeometry => {
  const rings = paint.features.map((feature) => {
    const ring = feature.geometry.coordinates[0]!
    const [first, last] = [ring[0]!, ring[ring.length - 1]!]
    return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring
  })
  const vertices = rings.reduce((total, ring) => total + ring.length + 1, 0)
  const triangles = rings.reduce((total, ring) => total + ring.length, 0)
  const position = new Float32Array(vertices * 3)
  const colours = new Float32Array(vertices * 4)
  const index = new Uint32Array(triangles * 3)
  let vi = 0
  let ii = 0
  paint.features.forEach((feature, k) => {
    const ring = rings[k]!
    const own = feature.properties.colour ?? colour
    const alpha = own
      ? (c.set(own), 0.12 + 0.78 * Math.min(1, Math.max(0, feature.properties.v)))
      : rampColour(theme, feature.properties.v, c)
    const centre = vi
    const put = (point: Vector3): void => {
      point
        .normalize()
        .multiplyScalar(radius)
        .toArray(position, vi * 3)
      colours.set([c.r, c.g, c.b, alpha], vi * 4)
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
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(position, 3))
  geometry.setAttribute("color", new BufferAttribute(colours, 4))
  geometry.setIndex(new BufferAttribute(index, 1))
  return geometry
}
