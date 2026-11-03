// Natural Earth's GeoJSON (public domain), read from a local directory or fetched from its repository.
import { readFileSync } from "node:fs"
import type { MultiPolygon, Polygon } from "../src/geo.ts"

export const NATURAL_EARTH_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"

export type Geometry = { type: "Polygon"; coordinates: Polygon } | { type: "MultiPolygon"; coordinates: MultiPolygon }

export interface Feature<Properties> {
  properties: Properties
  geometry: Geometry
}

interface FeatureCollection<Properties> {
  features: Feature<Properties>[]
}

export const parseFeatures = <Properties>(text: string): Feature<Properties>[] =>
  (JSON.parse(text) as FeatureCollection<Properties>).features

/** The features of `<name>.geojson`, from `directory` if given. */
export const loadFeatures = async <Properties = Record<string, unknown>>(
  name: string,
  directory: string | undefined
): Promise<Feature<Properties>[]> =>
  parseFeatures(
    directory
      ? readFileSync(`${directory}/${name}.geojson`, "utf8")
      : await (await fetch(`${NATURAL_EARTH_URL}/${name}.geojson`)).text()
  )
