import type { LatLon } from "@whereabouts/shared/geo"

/**
 * An outline (GeoJSON MultiPolygon coordinates, [lon, lat]) as an SVG path,
 * fitted and centred in a `width` × `height` box less `pad`. Longitudes are
 * taken about `centre` (so a shape across the antimeridian stays whole) and
 * narrowed by the cosine of its latitude, near enough to the map's shape for
 * a thumbnail. Points closer than half a pixel are dropped.
 */
export function outlinePath(outline: number[][][][], centre: LatLon, width: number, height: number, pad = 3): string {
  const k = Math.cos((centre.lat * Math.PI) / 180)
  const project = ([lon, lat]: number[]): Point => [(((lon! - centre.lon + 540) % 360) - 180) * k, -lat!]
  const rings = outline.flat()
  const box = boundsOf(rings.flat().map(project))
  if (!box) return ""
  const fit = fitInto(box, width, height, pad)
  return rings.map((ring) => ringPath(ring.map((position) => fit(project(position))))).join("")
}

type Point = [number, number]
interface Bounds {
  x0: number
  x1: number
  y0: number
  y1: number
}

/** Undefined for no points, or for points that are all one spot. */
function boundsOf(points: Point[]): Bounds | undefined {
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }
  for (const [x, y] of points) {
    box.x0 = Math.min(box.x0, x)
    box.x1 = Math.max(box.x1, x)
    box.y0 = Math.min(box.y0, y)
    box.y1 = Math.max(box.y1, y)
  }
  return box.x1 > box.x0 || box.y1 > box.y0 ? box : undefined
}

/** Scales and moves points so `box` is centred in the width × height box, less `pad`. */
function fitInto({ x0, x1, y0, y1 }: Bounds, width: number, height: number, pad: number): (point: Point) => Point {
  const s = Math.min((width - 2 * pad) / (x1 - x0 || 1), (height - 2 * pad) / (y1 - y0 || 1))
  const ox = (width - (x1 - x0) * s) / 2
  const oy = (height - (y1 - y0) * s) / 2
  return ([x, y]) => [ox + (x - x0) * s, oy + (y - y0) * s]
}

function ringPath(points: Point[]): string {
  let last: Point | undefined
  let part = ""
  for (const p of points) {
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.5) continue
    part += `${part ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`
    last = p
  }
  return part && `${part}Z`
}
