// Builds land.json, the land mask the "Trim sea" button uses: every H3 cell
// at LAND_RES (see src/land.ts) that touches land, plus one ring around them,
// compacted. From Natural Earth's 1:10m land and minor islands (public
// domain): the 1:50m land misses atolls such as the Marshall Islands and
// Tonga, which have questions of their own.
//
// Usage: node scripts/build-land.mjs [dir with ne_10m_land.geojson and ne_10m_minor_islands.geojson]
// Without a directory it downloads both from the Natural Earth repository.
// Takes about a minute.
//
// A painted cell is trimmed when its LAND_RES cell is not in the mask. With
// cells about 26 km across and the extra ring, that removes paint more than
// about 50 km from any land and keeps everything nearer, so a coast or an
// island is never nibbled.
import { readFileSync, writeFileSync } from "node:fs";
import { compactCells, gridDisk, polygonToCellsExperimental, POLYGON_TO_CELLS_FLAGS } from "h3-js";

const LAND_RES = 4;
const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson";
const FILES = ["ne_10m_land", "ne_10m_minor_islands"];

async function features(name) {
  const dir = process.argv[2];
  const text = dir
    ? readFileSync(`${dir}/${name}.geojson`, "utf8")
    : await (await fetch(`${NE}/${name}.geojson`)).text();
  return JSON.parse(text).features;
}

const land = new Set();
for (const name of FILES) {
  for (const f of await features(name)) {
    const polygons = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const polygon of polygons) {
      for (const h of polygonToCellsExperimental(
        polygon,
        LAND_RES,
        POLYGON_TO_CELLS_FLAGS.containmentOverlapping,
        true,
      ))
        land.add(h);
    }
  }
}
const mask = new Set(land);
for (const h of land) for (const n of gridDisk(h, 1)) mask.add(n);
const cells = compactCells([...mask]).sort();
const json = JSON.stringify({ res: LAND_RES, cells });
writeFileSync(new URL("../land.json", import.meta.url), json + "\n");
console.log(
  `${land.size} land cells, ${mask.size} with the ring, ${cells.length} compacted: ${Math.round(json.length / 1024)} KB`,
);
