// Builds water.json, the mask the "Trim land" button uses in a lake or sea
// round: every H3 cell at WATER_RESOLUTION lying wholly on land and touching no
// lake, compacted. Trimming drops paint in those cells, so paint within a
// cell of any water stays. From Natural Earth's 1:10m land and lakes (public
// domain), and the lake rounds' outlines too, since lake rounds are
// scored by those: build that first. The land mask (build-land.mjs) cannot
// serve: lakes are land in it.
//
// Usage: node scripts/build-water.mjs [dir with ne_10m_land.geojson and ne_10m_lakes.geojson]
// Without a directory it downloads both from the Natural Earth repository.
// Takes about three minutes.
import { readFileSync, writeFileSync } from "node:fs"
import { compactCells, polygonToCellsExperimental, POLYGON_TO_CELLS_FLAGS } from "h3-js"

const WATER_RESOLUTION = 5
const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"

const polygons = async (name) => {
  const dir = process.argv[2]
  const text = dir
    ? readFileSync(`${dir}/${name}.geojson`, "utf8")
    : await (await fetch(`${NE}/${name}.geojson`)).text()
  return JSON.parse(text).features.flatMap((feature) =>
    feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates
  )
}

const cells = (polygon, mode) =>
  polygonToCellsExperimental(polygon, WATER_RESOLUTION, POLYGON_TO_CELLS_FLAGS[mode], true)

const dry = new Set()
for (const polygon of await polygons("ne_10m_land")) for (const cell of cells(polygon, "containmentFull")) dry.add(cell)
const before = dry.size
const json = (file) => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"))
const outlines = json("outlines.json")
const lakeRounds = json("places.json")
  .filter((place) => place.feature === "LAKE")
  .flatMap((place) => outlines[place.area.outline])
for (const polygon of [...(await polygons("ne_10m_lakes")), ...lakeRounds])
  for (const cell of cells(polygon, "containmentOverlapping")) dry.delete(cell)

const compacted = compactCells([...dry]).sort()
const out = JSON.stringify({ resolution: WATER_RESOLUTION, dry: compacted })
writeFileSync(new URL("../water.json", import.meta.url), out + "\n")
console.log(
  `${before} dry cells, ${before - dry.size} of them by a lake, ${compacted.length} compacted: ${Math.round(out.length / 1024)} KB`
)
