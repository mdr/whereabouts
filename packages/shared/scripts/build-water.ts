// Builds water.json, the mask the "Trim land" button uses in a lake or sea
// round: every H3 cell at WATER_RESOLUTION lying wholly on land and touching no
// lake, compacted. Trimming drops paint in those cells, so paint within a
// cell of any water stays. From Natural Earth's 1:10m land and lakes (public
// domain), and the lake rounds' outlines too, since lake rounds are
// scored by those: build that first. The land mask (build-land.ts) cannot
// serve: lakes are land in it.
//
// Usage: node --experimental-transform-types scripts/build-water.ts [dir with ne_10m_land.geojson and ne_10m_lakes.geojson]
// Without a directory it downloads both from the Natural Earth repository.
// Takes about three minutes.
import { readFileSync, writeFileSync } from "node:fs"
import { compactCells, polygonToCellsExperimental, POLYGON_TO_CELLS_FLAGS } from "h3-js"
import { FeatureType } from "../src/questions.ts"
import type { MultiPolygon, Polygon } from "../src/geo.ts"
import { loadFeatures } from "./natural-earth.ts"
import { polygonsOf } from "./outline.ts"
import type { StoredPlace, Outlines } from "./write-catalogue.ts"

const WATER_RESOLUTION = 5

const polygons = async (name: string): Promise<MultiPolygon> =>
  (await loadFeatures(name, process.argv[2])).flatMap((feature) => polygonsOf(feature.geometry))

const cells = (polygon: Polygon, mode: keyof typeof POLYGON_TO_CELLS_FLAGS): string[] =>
  polygonToCellsExperimental(polygon, WATER_RESOLUTION, POLYGON_TO_CELLS_FLAGS[mode], true)

const dry = new Set<string>()
for (const polygon of await polygons("ne_10m_land")) for (const cell of cells(polygon, "containmentFull")) dry.add(cell)
const before = dry.size
const json = <T>(file: string): T => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8")) as T
const outlines = json<Outlines>("outlines.json")
const lakeRounds = json<StoredPlace[]>("places.json")
  .filter((place) => place.feature === FeatureType.LAKE)
  .flatMap((place) => outlines[place.area!.outline]!)
for (const polygon of [...(await polygons("ne_10m_lakes")), ...lakeRounds])
  for (const cell of cells(polygon, "containmentOverlapping")) dry.delete(cell)

const compacted = compactCells([...dry]).sort()
const out = JSON.stringify({ resolution: WATER_RESOLUTION, dry: compacted })
writeFileSync(new URL("../water.json", import.meta.url), out + "\n")
console.log(
  `${before} dry cells, ${before - dry.size} of them by a lake, ${compacted.length} compacted: ${Math.round(out.length / 1024)} KB`
)
