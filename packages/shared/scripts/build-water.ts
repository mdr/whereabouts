// Builds water.json, the mask the "Trim land" button uses in a lake or sea
// round: every H3 cell at WATER_RESOLUTION lying wholly on land, compacted.
// In a lake round a cell at least LAKE_SHARE lake is wet, and so is any cell a
// lake round's outline touches, since those rounds are scored by their
// outlines and must never trim themselves away. Those cells are listed apart,
// as lakes, since a sea round ignores lakes. Every cell a sea round paints is
// wet in every round, for the same reason. From Natural Earth's 1:10m land and
// lakes (public domain) and the lake and sea rounds' outlines: build those
// first. The land mask (build-land.ts) cannot serve: lakes are land in it.
//
// Usage: node --experimental-transform-types scripts/build-water.ts [dir with ne_10m_land.geojson and ne_10m_lakes.geojson]
// Without a directory it downloads both from the Natural Earth repository.
// Takes about an hour.
import { readFileSync, writeFileSync } from "node:fs"
import {
  cellToChildren,
  cellToParent,
  compactCells,
  polygonToCells,
  polygonToCellsExperimental,
  POLYGON_TO_CELLS_FLAGS
} from "h3-js"
import { FeatureType } from "../src/questions.ts"
import { resolutionForTolerance } from "../src/paint/paint.ts"
import type { MultiPolygon, Polygon } from "../src/geo.ts"
import { loadFeatures } from "./natural-earth.ts"
import { polygonsOf } from "./outline.ts"
import type { StoredPlace, Outlines } from "./write-catalogue.ts"

const WATER_RESOLUTION = 6
/** Lake share is measured in these cells' centres, 49 to a mask cell. */
const SAMPLE_RESOLUTION = WATER_RESOLUTION + 2
/** Northern Canada's countless small lakes would otherwise keep most of its land. */
const LAKE_SHARE = 0.25

const polygons = async (name: string): Promise<MultiPolygon> =>
  (await loadFeatures(name, process.argv[2])).flatMap((feature) => polygonsOf(feature.geometry))

const cells = (polygon: Polygon, resolution: number, mode: keyof typeof POLYGON_TO_CELLS_FLAGS): string[] =>
  polygonToCellsExperimental(polygon, resolution, POLYGON_TO_CELLS_FLAGS[mode], true)

const dry = new Set<string>()
for (const polygon of await polygons("ne_10m_land"))
  for (const cell of cells(polygon, WATER_RESOLUTION, "containmentFull")) dry.add(cell)

const json = <T>(file: string): T => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8")) as T
const outlines = json<Outlines>("outlines.json")
const places = json<StoredPlace[]>("places.json")

// A sea round's paint is coarser than the mask, so trimLand judges each painted cell by its mask cells'
// wet share: the cells the round paints (centres inside its outline, as regionCells) are wet throughout.
for (const place of places.filter((place) => place.feature === FeatureType.SEA)) {
  const resolution = resolutionForTolerance(place.area!.tolerance)
  for (const polygon of outlines[place.area!.outline]!)
    for (const cell of polygonToCells(polygon, resolution, true))
      for (const part of resolution <= WATER_RESOLUTION
        ? cellToChildren(cell, WATER_RESOLUTION)
        : [cellToParent(cell, WATER_RESOLUTION)])
        dry.delete(part)
}
const seaDry = new Set(dry)
const before = dry.size

const lakeRounds = places
  .filter((place) => place.feature === FeatureType.LAKE)
  .flatMap((place) => outlines[place.area!.outline]!)
for (const polygon of lakeRounds)
  for (const cell of cells(polygon, WATER_RESOLUTION, "containmentOverlapping")) dry.delete(cell)
const byRounds = before - dry.size

const lakes = await polygons("ne_10m_lakes")
const lakeSamples = new Set<string>()
const touched = new Set<string>()
for (const polygon of lakes) {
  for (const cell of cells(polygon, SAMPLE_RESOLUTION, "containmentCenter")) lakeSamples.add(cell)
  for (const cell of cells(polygon, WATER_RESOLUTION, "containmentOverlapping")) if (dry.has(cell)) touched.add(cell)
}
for (const cell of touched) {
  const samples = cellToChildren(cell, SAMPLE_RESOLUTION)
  if (samples.filter((sample) => lakeSamples.has(sample)).length >= LAKE_SHARE * samples.length) dry.delete(cell)
}

const compacted = compactCells([...dry]).sort()
const lakeOnly = compactCells([...seaDry].filter((cell) => !dry.has(cell))).sort()
const out = JSON.stringify({ resolution: WATER_RESOLUTION, dry: compacted, lakes: lakeOnly })
writeFileSync(new URL("../water.json", import.meta.url), out + "\n")
console.log(
  `${before} dry cells, ${byRounds} of them by a lake round, ${before - byRounds - dry.size} more by other lakes ` +
    `(of ${touched.size} touching one), ${compacted.length} + ${lakeOnly.length} compacted: ${Math.round(out.length / 1024)} KB`
)
