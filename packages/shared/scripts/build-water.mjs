// Builds water.json, the mask the "Trim land" button uses in a lake or sea
// round: every H3 cell at WATER_RES lying wholly on land and touching no
// lake, compacted. Trimming drops paint in those cells, so paint within a
// cell of any water stays. From Natural Earth's 1:10m land and lakes (public
// domain), and the lake outlines in features.json too, since lake rounds are
// scored by those: build that first. The land mask (build-land.mjs) cannot
// serve: lakes are land in it.
//
// Usage: node scripts/build-water.mjs [dir with ne_10m_land.geojson and ne_10m_lakes.geojson]
// Without a directory it downloads both from the Natural Earth repository.
// Takes about three minutes.
import { readFileSync, writeFileSync } from "node:fs"
import { compactCells, polygonToCellsExperimental, POLYGON_TO_CELLS_FLAGS } from "h3-js"

const WATER_RES = 5
const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"

async function polygons(name) {
  const dir = process.argv[2]
  const text = dir
    ? readFileSync(`${dir}/${name}.geojson`, "utf8")
    : await (await fetch(`${NE}/${name}.geojson`)).text()
  return JSON.parse(text).features.flatMap((f) =>
    f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates
  )
}

const cells = (polygon, mode) => polygonToCellsExperimental(polygon, WATER_RES, POLYGON_TO_CELLS_FLAGS[mode], true)

const dry = new Set()
for (const polygon of await polygons("ne_10m_land")) for (const h of cells(polygon, "containmentFull")) dry.add(h)
const before = dry.size
const lakeRounds = JSON.parse(readFileSync(new URL("../features.json", import.meta.url), "utf8"))
  .filter((q) => q.topic === "lake")
  .flatMap((q) => q.outline)
for (const polygon of [...(await polygons("ne_10m_lakes")), ...lakeRounds])
  for (const h of cells(polygon, "containmentOverlapping")) dry.delete(h)

const compacted = compactCells([...dry]).sort()
const json = JSON.stringify({ res: WATER_RES, dry: compacted })
writeFileSync(new URL("../water.json", import.meta.url), json + "\n")
console.log(
  `${before} dry cells, ${before - dry.size} of them by a lake, ${compacted.length} compacted: ${Math.round(json.length / 1024)} KB`
)
