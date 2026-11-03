// Builds islands.json, the landmasses the Fill tool fills on an island
// round: every 1:50m land polygon from Natural Earth (public domain) of at
// least MIN_KM2 and at most MAX_KM2, leaving out the continents. Each is
// simplified as outlines.json's are, so filling an island round's answer
// paints the very outline it is scored by.
//
// Usage: node scripts/build-islands.ts [path/to/ne_50m_land.geojson]
// Without a path it downloads the file from the Natural Earth repository.
import { readFileSync, writeFileSync } from "node:fs"
import { NATURAL_EARTH_URL, parseFeatures } from "./natural-earth.ts"
import { polygonAreaKm2, polygonsOf, simplified } from "./outline.ts"

const NE_URL = `${NATURAL_EARTH_URL}/ne_50m_land.geojson`
/** Smaller holds hardly a cell at the finest painting resolution. */
const MIN_KM2 = 50
/** Greenland, the largest island, is 2.1 million km²; Australia, the smallest continent, 7.6 million. */
const MAX_KM2 = 3e6

const features = parseFeatures(
  process.argv[2] ? readFileSync(process.argv[2], "utf8") : await (await fetch(NE_URL)).text()
)
const islands = simplified(
  features
    .flatMap((feature) => polygonsOf(feature.geometry))
    .filter((polygon) => {
      const area = polygonAreaKm2(polygon)
      return area >= MIN_KM2 && area <= MAX_KM2
    })
)
const json = JSON.stringify(islands)
writeFileSync(new URL("../islands.json", import.meta.url), json + "\n")
console.log(`wrote ${islands.length} islands to islands.json, ${Math.round(json.length / 1024)} KB`)
