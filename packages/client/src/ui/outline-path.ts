import type { LatLon } from "@whereabouts/shared"

/**
 * An outline (GeoJSON MultiPolygon coordinates, [lon, lat]) as an SVG path,
 * fitted and centred in a `width` × `height` box less `pad`. Longitudes are
 * taken about `centre` (so a shape across the antimeridian stays whole) and
 * narrowed by the cosine of its latitude, near enough to the map's shape for
 * a thumbnail. Points closer than half a pixel are dropped.
 */
export function outlinePath(outline: number[][][][], centre: LatLon, width: number, height: number, pad = 3): string {
  const k = Math.cos((centre.lat * Math.PI) / 180)
  const x = (lon: number) => (((lon - centre.lon + 540) % 360) - 180) * k
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity]
  for (const polygon of outline)
    for (const ring of polygon)
      for (const [lon, lat] of ring) {
        const px = x(lon!)
        x0 = Math.min(x0, px)
        x1 = Math.max(x1, px)
        y0 = Math.min(y0, -lat!)
        y1 = Math.max(y1, -lat!)
      }
  if (!(x1 > x0 || y1 > y0)) return ""
  const s = Math.min((width - 2 * pad) / (x1 - x0 || 1), (height - 2 * pad) / (y1 - y0 || 1))
  const ox = (width - (x1 - x0) * s) / 2
  const oy = (height - (y1 - y0) * s) / 2
  let d = ""
  for (const polygon of outline)
    for (const ring of polygon) {
      let last: [number, number] | undefined
      let part = ""
      for (const [lon, lat] of ring) {
        const p: [number, number] = [ox + (x(lon!) - x0) * s, oy + (-lat! - y0) * s]
        if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.5) continue
        part += `${part ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`
        last = p
      }
      if (part) d += `${part}Z`
    }
  return d
}
