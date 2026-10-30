// Outline helpers shared by build-regions.mjs and build-features.mjs: areas,
// the parts of a place that are kept, simplification, and the tolerances.
import { cellArea, cellToLatLng, polygonToCells, UNITS } from "h3-js"

/** Islands this big can carry the outline on to land within CHAIN_KM of them; smaller ones only join it. */
const MIN_PART_KM2 = 1500
const CHAIN_KM = 500
const TOLERANCE_FRACTION = 0.2
export const SIMPLIFY_DEG = 0.015
/** Countries smaller than this are asked as a point: too small to paint the shape of. */
export const POINT_BELOW_KM2 = 10_000
/**
 * Countries whose kept parts hold less than this share of their land are
 * asked as a point too: their outline would leave out land far from the rest
 * that a player might paint.
 */
export const MIN_KEPT_SHARE = 0.75

const R = 6371
export function km([lon1, lat1], [lon2, lat2]) {
  const r = Math.PI / 180
  const h =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Closest approach between two polygons' outer rings, by vertices. */
function gapKm(a, b) {
  let best = Infinity
  for (const p of a[0]) for (const q of b[0]) best = Math.min(best, km(p, q))
  return best
}

export const cellsOf = (polygon, res) => polygonToCells(polygon, res, true)
export const areaOf = (cells) => cells.reduce((s, h) => s + cellArea(h, UNITS.km2), 0)

/** A ring's area on the sphere, km² (the spherical excess, as in d3-geo). */
export function ringAreaKm2(ring) {
  const r = Math.PI / 180
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i]
    const [lon2, lat2] = ring[i + 1]
    sum += (lon2 - lon1) * r * (2 + Math.sin(lat1 * r) + Math.sin(lat2 * r))
  }
  return Math.abs((sum * R * R) / 2)
}

/** Whether [lon, lat] is inside a ring (ray casting, in degrees: fine at island scale). */
function inRing([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
export const onLand = (pt, polygons) =>
  polygons.some(([outer, ...holes]) => inRing(pt, outer) && !holes.some((h) => inRing(pt, h)))

/**
 * Where a small country is asked: its label point, unless that is out at sea
 * (São Tomé and Príncipe's lies between its two islands, 70 km from each),
 * then the middle of its largest island. Within LABEL_SLACK_KM of the land
 * counts as on it: the 1:50m outline of Vatican City misses its label point.
 */
const LABEL_SLACK_KM = 5
export function islandAnswer(p, polygons) {
  const label = { lat: round4(p.LABEL_Y), lon: round4(p.LABEL_X) }
  const pt = [label.lon, label.lat]
  const near = polygons.some((poly) => poly[0].some((v) => km(pt, v) <= LABEL_SLACK_KM))
  if (near || onLand(pt, polygons)) return label
  const largest = polygons.reduce((a, b) => (polygonAreaKm2(b) > polygonAreaKm2(a) ? b : a))
  const cells = cellsOf(largest, 9)
  const middle = cells.length > 0 ? centroid(cells) : null
  if (middle && onLand([middle.lon, middle.lat], [largest])) return middle
  const [lon, lat] = largest[0][0]
  return { lat: round4(lat), lon: round4(lon) }
}

/** A polygon's area, km²: its outer ring less its holes. */
export const polygonAreaKm2 = ([outer, ...holes]) => ringAreaKm2(outer) - holes.reduce((s, h) => s + ringAreaKm2(h), 0)

export const polygonsOf = (geometry) => (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates)

/**
 * The largest landmass, the islands of at least MIN_PART_KM2 chained to it
 * within chainKm, and every smaller island within chainKm of those. Small
 * islands do not extend the chain, or Bear Island would bring Svalbard into
 * Norway.
 */
export function keptParts(geometry, chainKm = CHAIN_KM) {
  const all = polygonsOf(geometry).map((polygon) => ({ polygon, area: areaOf(cellsOf(polygon, 6)) }))
  const parts = all.filter((p) => p.area >= MIN_PART_KM2).sort((a, b) => b.area - a.area)
  const largest = all.reduce((a, b) => (b.area > a.area ? b : a))
  if (parts[0] !== largest) parts.unshift(largest)
  const kept = [parts.shift()]
  // Grow the set: an island joins if it is near any part already kept.
  for (let grew = true; grew;) {
    grew = false
    for (let i = 0; i < parts.length; i++) {
      if (kept.some((k) => gapKm(k.polygon, parts[i].polygon) <= chainKm)) {
        kept.push(...parts.splice(i, 1))
        grew = true
        i--
      }
    }
  }
  const big = [...kept]
  const bigPolygons = big.map((k) => k.polygon)
  // Nor may they take an outline across the antimeridian (Fiji's Lau Islands), which would make it a point round.
  const mayCross = crossesAntimeridian(bigPolygons)
  for (const p of all) {
    if (kept.includes(p) || !big.some((k) => gapKm(k.polygon, p.polygon) <= chainKm)) continue
    if (!mayCross && crossesAntimeridian([...bigPolygons, p.polygon])) continue
    kept.push(p)
  }
  return kept.map((p) => p.polygon)
}

/**
 * Whether the parts reach the antimeridian from both sides. Natural Earth
 * splits polygons there, so each part is fine on its own, but the country's
 * outline and framing are not: such countries are asked as a point.
 */
export function crossesAntimeridian(polygons) {
  const lons = polygons.flatMap((p) => p[0].map(([lon]) => lon))
  return Math.max(...lons) > 179.5 && Math.min(...lons) < -179.5
}

const round4 = (v) => Math.round(v * 1e4) / 1e4

export function centroid(cells) {
  let x = 0,
    y = 0,
    z = 0
  for (const h of cells) {
    const [lat, lon] = cellToLatLng(h)
    const a = cellArea(h, UNITS.km2)
    const la = (lat * Math.PI) / 180,
      lo = (lon * Math.PI) / 180
    x += a * Math.cos(la) * Math.cos(lo)
    y += a * Math.cos(la) * Math.sin(lo)
    z += a * Math.sin(la)
  }
  return {
    lat: round4((Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI),
    lon: round4((Math.atan2(y, x) * 180) / Math.PI)
  }
}

/** Douglas-Peucker on a closed ring, in degrees (longitude scaled by cos(lat)). */
export function simplifyRing(ring, eps) {
  const cos = Math.cos((ring[0][1] * Math.PI) / 180)
  const keep = new Uint8Array(ring.length)
  keep[0] = keep[ring.length - 1] = 1
  const stack = [[0, ring.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()
    const [ax, ay] = [ring[a][0] * cos, ring[a][1]]
    const [bx, by] = [ring[b][0] * cos, ring[b][1]]
    const len = Math.hypot(bx - ax, by - ay)
    let worst = -1,
      at = -1
    for (let i = a + 1; i < b; i++) {
      const [px, py] = [ring[i][0] * cos, ring[i][1]]
      const d = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len
      if (d > worst) {
        worst = d
        at = i
      }
    }
    if (worst > eps) {
      keep[at] = 1
      stack.push([a, at], [at, b])
    }
  }
  const out = ring.filter((_, i) => keep[i]).map(([lon, lat]) => [round2(lon), round2(lat)])
  // Rounding can repeat a point; a ring needs four positions to stay a polygon.
  const dedup = out.filter((pt, i) => i === 0 || pt[0] !== out[i - 1][0] || pt[1] !== out[i - 1][1])
  return dedup.length >= 4 ? dedup : null
}

const round2 = (v) => Math.round(v * 100) / 100
export const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-|-$/g, "")

/**
 * The tolerance of a country asked as a point, km: POINT_TOLERANCE_FRACTION
 * of its equivalent radius, and at least MIN_POINT_TOLERANCE_KM. A small or
 * scattered country's islands can lie far apart (Kiribati, the Bahamas), so
 * for those it is at least SPREAD_FRACTION of its spread: the greatest distance from the
 * answer to any of its land. Rounded to 5 km. At half the radius, painting
 * the country evenly scores about 890, a tight blob at its centre about 990,
 * and a neighbour's area two radii away about 640.
 */
const POINT_TOLERANCE_FRACTION = 0.5
const SPREAD_FRACTION = 0.25
const MIN_POINT_TOLERANCE_KM = 15
export function pointToleranceKm(areaKm2, spreadKm, islands) {
  const t = Math.max(POINT_TOLERANCE_FRACTION * Math.sqrt(areaKm2 / Math.PI), islands ? SPREAD_FRACTION * spreadKm : 0)
  return Math.max(MIN_POINT_TOLERANCE_KM, Math.round(t / 5) * 5)
}

/** A painted place's tolerance, km: TOLERANCE_FRACTION of its equivalent radius, rounded to 5 km. */
export const regionToleranceKm = (areaKm2) =>
  Math.max(5, Math.round((TOLERANCE_FRACTION * Math.sqrt(areaKm2 / Math.PI)) / 5) * 5)
