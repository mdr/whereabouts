// Builds land.json, the land mask the "Trim sea" button uses: every H3 cell
// at LAND_RESOLUTION (see src/paint/land.ts) that touches land, compacted. From Natural Earth's 1:10m land and minor islands (public
// domain): the 1:50m land misses atolls such as the Marshall Islands and
// Tonga, which have questions of their own.
//
// Usage: node scripts/build-land.mjs [dir with ne_10m_land.geojson and ne_10m_minor_islands.geojson]
// Without a directory it downloads both from the Natural Earth repository.
// Takes about five minutes.
//
// A painted cell is trimmed when its LAND_RESOLUTION cell is not in the mask. A
// cell touching land by a sliver is kept whole, so with cells about 17 km
// across, sea paint within roughly 0 to 20 km of land stays and the rest
// goes. There is no further margin: answers are all on land (a test checks),
// so the mask need not keep open sea for them.
import { readFileSync, writeFileSync } from "node:fs"
import { compactCells, polygonToCellsExperimental, POLYGON_TO_CELLS_FLAGS } from "h3-js"

const LAND_RESOLUTION = 5
const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"
const FILES = ["ne_10m_land", "ne_10m_minor_islands"]

const features = async (name) => {
  const dir = process.argv[2]
  const text = dir
    ? readFileSync(`${dir}/${name}.geojson`, "utf8")
    : await (await fetch(`${NE}/${name}.geojson`)).text()
  return JSON.parse(text).features
}

const land = new Set()
for (const name of FILES) {
  for (const feature of await features(name)) {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates
    for (const polygon of polygons) {
      for (const cell of polygonToCellsExperimental(
        polygon,
        LAND_RESOLUTION,
        POLYGON_TO_CELLS_FLAGS.containmentOverlapping,
        true
      ))
        land.add(cell)
    }
  }
}
const cells = compactCells([...land]).sort()
const json = JSON.stringify({ resolution: LAND_RESOLUTION, cells })
writeFileSync(new URL("../land.json", import.meta.url), json + "\n")
console.log(`${land.size} land cells, ${cells.length} compacted: ${Math.round(json.length / 1024)} KB`)
