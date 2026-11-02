/** What the Fill tool fills, and how it finds it. */
import type { H3Cell, H3Resolution } from "@whereabouts/shared/h3"
import type { LatLon } from "@whereabouts/shared/geo"
import type { Km } from "@whereabouts/shared/units"

/** A country, on a country or flag round; an island, on an island round. */
export enum FillType {
  COUNTRY = "COUNTRY",
  ISLAND = "ISLAND"
}

/** One thing the Fill tool can fill. `id` tells which are filled. */
export interface FillTarget {
  id: string
  /** For the cursor. */
  outline: GeoJSON.MultiPolygon
  /** The cells that fill it on a layer of this finest resolution. */
  cells: (finestResolution: H3Resolution) => H3Cell[]
}

/** Finds what the Fill tool would fill at a point, or a small one within `reach` of it. */
export interface Filler {
  type: FillType
  targetAt: (point: LatLon, reach: Km) => FillTarget | undefined
}
