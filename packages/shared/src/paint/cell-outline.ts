import type { Ring } from "../geo.ts"
import { cellsToMultiPolygon, type H3Cell } from "../h3.ts"

/**
 * The polygon's rings with longitudes shifted into one continuous range where
 * it straddles the antimeridian, so it does not span the whole world.
 */
export function unwrapAntimeridian(polygon: Ring[]): Ring[] {
  let minLon = Infinity
  let maxLon = -Infinity
  for (const ring of polygon) {
    for (const [lon] of ring) {
      if (lon < minLon) minLon = lon
      if (lon > maxLon) maxLon = lon
    }
  }
  if (maxLon - minLon <= 180) return polygon
  return polygon.map((ring) => ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]))
}

/** Outline of a set of cells as one GeoJSON MultiPolygon, e.g. a brush footprint. */
export function cellsOutline(cells: H3Cell[]): GeoJSON.MultiPolygon {
  return { type: "MultiPolygon", coordinates: cellsToMultiPolygon(cells, true).map(unwrapAntimeridian) }
}
