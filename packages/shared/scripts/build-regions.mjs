// Builds the catalogue's whole-country and flag questions, with the
// countries as places and their outlines, and borders.json, from Natural
// Earth's 1:50m countries (public domain). See write-catalogue.mjs.
//
// Usage: node scripts/build-regions.mjs [path/to/ne_50m_admin_0_countries.geojson]
// Without a path it downloads the file from the Natural Earth repository.
//
// The countries are the answers for "Paint the whole of Germany": every
// sovereign country of at least POINT_BELOW_KM2 whose borders are not in
// dispute and which does not cross the antimeridian, as an outline. Each keeps
// its largest landmass, the islands of at least MIN_PART_KM2 chained to it
// within CHAIN_KM, and every smaller island within CHAIN_KM of those (so
// Sicily, Crete and the Aegean stay; the Canaries, Svalbard and Alaska go). The tolerance is a fifth of the country's
// equivalent radius, sqrt(area / pi): the scale the region kernel was
// calibrated at. Outlines are simplified to about SIMPLIFY_DEG
// (Douglas-Peucker), far finer than any tolerance, and rounded to match.
//
// The flag rounds are one per country: those painted whole paint the
// country's area, the rest are asked as a point, with a tolerance from
// their size (pointToleranceKm).
//
// borders.json holds every flag country's land, coarser (BORDER_SIMPLIFY_DEG,
// islands under BORDER_MIN_KM2 left out), for the reveal of a flag round:
// which country is under the pointer, and which one a player's paint is in.
// It also holds the areas where it names no country (none): those Natural
// Earth marks indeterminate (part of Western Sahara, Palestine, the Siachen
// Glacier), the rest of Western Sahara, and Crimea. Each ring is a flat list of [lon, lat] steps in hundredths of a degree
// (the first step from 0, 0), which gzips to about a third of plain
// coordinates. A small or scattered country (asked as a point, on land)
// also has near: its tolerance, the distance from its answer that counts as
// the country too, since its islands are too small to hit.
import { readFileSync, writeFileSync } from "node:fs"
import { writeQuestions } from "./write-catalogue.mjs"
import {
  POINT_BELOW_KM2,
  MIN_KEPT_SHARE,
  SIMPLIFY_DEG,
  areaOf,
  cellsOf,
  centroid,
  crossesAntimeridian,
  islandAnswer,
  keptParts,
  distanceKm,
  pointToleranceKm,
  polygonAreaKm2,
  polygonsOf,
  regionToleranceKm,
  ringAreaKm2,
  simplifyRing,
  slug
} from "./outline.mjs"

const NE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson"
/** Wider island chaining for a country in two halves: East Malaysia is 600 km from the peninsula. */
const CHAIN_KM_FOR = { Malaysia: 800 }

// Not UN members, and each wholly inside a disputed area: left out.
const LEFT_OUT = new Set(["Northern Cyprus", "Somaliland", "Taiwan", "Kosovo"])

// Part of the border is disputed, so no outline would be fair to paint: in
// flag rounds these are asked as a point, and there are no "Paint the whole
// of" rounds for them.
const DISPUTED = new Set([
  "China", // Aksai Chin, Arunachal Pradesh
  "India", // Kashmir, Aksai Chin, Arunachal Pradesh
  "Pakistan", // Kashmir
  "Israel", // the West Bank, the Golan Heights
  "Morocco", // Western Sahara
  "Republic of Serbia", // Kosovo
  "Somalia", // Somaliland
  "Ukraine", // Crimea, drawn with Russia in Natural Earth
  "Cyprus" // Northern Cyprus
])

// Overrides by Natural Earth ADMIN name. label: shown after the reveal
// (default NAME_EN); the: prompts say "the Netherlands"; name: what the
// prompt calls it, where the outline is only part of the country; wiki:
// English Wikipedia title (default the label); flagWiki: the title of the
// article on its flag, linked from a flag round (default "Flag of" the
// label); id: kept from before flags.
const NAMES = {
  "United Kingdom": { the: true, id: "uk-region" },
  "Democratic Republic of the Congo": { the: true, id: "drc-region" },
  "Republic of the Congo": { the: true },
  "United States of America": { label: "United States", the: true, wiki: "United States" },
  Ireland: { wiki: "Republic of Ireland" },
  Georgia: { wiki: "Georgia (country)", flagWiki: "Flag of Georgia (country)" },
  China: { label: "China", wiki: "China" },
  Vatican: { label: "Vatican City", wiki: "Vatican City" },
  // Natural Earth labels it on Kiritimati, 3,300 km from the capital.
  Kiribati: { at: { lat: 1.3291, lon: 172.979 } },
  "East Timor": { label: "Timor-Leste" },
  Czechia: { label: "Czech Republic", the: true },
  Netherlands: { the: true },
  Philippines: { the: true },
  "The Bahamas": { label: "The Bahamas", the: true },
  Gambia: { label: "The Gambia", the: true },
  "Central African Republic": { the: true },
  "Dominican Republic": { the: true },
  "United Arab Emirates": { the: true },
  Maldives: { the: true },
  "Marshall Islands": { the: true },
  "Solomon Islands": { the: true },
  Comoros: { the: true },
  Seychelles: { the: true },
  "Federated States of Micronesia": { the: true },
  // The outline leaves out the overseas regions (French Guiana, Réunion and the rest).
  France: { name: "European France" }
}

const BORDER_SIMPLIFY_DEG = 0.05
const BORDER_MIN_KM2 = 50
/**
 * Parts of a country that the reveal names no country for, rather than take
 * a side (a polygon wholly inside one of these boxes, [west, south, east,
 * north]): Crimea, drawn with Russia in Natural Earth.
 */
const BORDER_LEFT_OUT = { Russia: [[32, 44, 37, 46.5]] }
/**
 * Natural Earth's Morocco includes the part of Western Sahara it controls:
 * everything south of the border, 27°40′N, names no country either.
 */
const BORDER_NONE_SOUTH_OF = { Morocco: 27 + 40 / 60 }

/** A ring clipped to the part south of a parallel (Sutherland-Hodgman against one edge). */
function southOf(ring, lat0) {
  const out = []
  for (let i = 0; i < ring.length - 1; i++) {
    const [from, to] = [ring[i], ring[i + 1]]
    if (from[1] <= lat0) out.push(from)
    if (from[1] <= lat0 !== to[1] <= lat0) {
      const fraction = (lat0 - from[1]) / (to[1] - from[1])
      out.push([from[0] + fraction * (to[0] - from[0]), lat0])
    }
  }
  return out.length >= 3 ? [...out, out[0]] : null
}
const inBoxes = (admin) => (polygon) =>
  (BORDER_LEFT_OUT[admin] ?? []).some(([west, south, east, north]) =>
    polygon[0].every(([lon, lat]) => lon >= west && lon <= east && lat >= south && lat <= north)
  )

/** Polygons' rings for borders.json, delta-encoded in hundredths of a degree. */
function borderRings(polygons) {
  return polygons
    .filter((polygon) => ringAreaKm2(polygon[0]) >= BORDER_MIN_KM2)
    .flatMap((polygon) => polygon.map((ring) => simplifyRing(ring, BORDER_SIMPLIFY_DEG)).filter(Boolean))
    .map((ring) => {
      let x = 0,
        y = 0
      return ring.flatMap(([lon, lat]) => {
        const [X, Y] = [Math.round(lon * 100), Math.round(lat * 100)]
        const step = [X - x, Y - y]
        ;[x, y] = [X, Y]
        return step
      })
    })
}

const ne = JSON.parse(process.argv[2] ? readFileSync(process.argv[2], "utf8") : await (await fetch(NE_URL)).text())
const countries = ne.features.filter((feature) => {
  const properties = feature.properties
  return (
    ["Sovereign country", "Country", "Sovereignty", "Disputed"].includes(properties.TYPE) &&
    properties.ADMIN === properties.SOVEREIGNT &&
    !LEFT_OUT.has(properties.ADMIN)
  )
})

const regions = []
const flags = []
const places = []
const outlines = {}
const borders = []
const none = borderRings(
  ne.features
    .filter((feature) => feature.properties.TYPE === "Indeterminate" && feature.properties.ADMIN !== "Antarctica")
    .flatMap((feature) => polygonsOf(feature.geometry))
)
for (const feature of countries.sort((a, b) => a.properties.ADMIN.localeCompare(b.properties.ADMIN))) {
  const properties = feature.properties
  const names = NAMES[properties.ADMIN] ?? {}
  const label = names.label ?? properties.NAME_EN
  const name = names.name ?? (names.the ? `the ${label.replace(/^The /, "")}` : label)
  const wiki = names.wiki ?? label
  const flagWiki = names.flagWiki ?? `Flag of ${names.the ? "the " : ""}${label.replace(/^The /, "")}`
  const flag = properties.ISO_A2_EH.toLowerCase()
  if (!/^[a-z]{2}$/.test(flag)) throw new Error(`no ISO code for ${properties.ADMIN}`)
  const all = polygonsOf(feature.geometry)
  const area = all.reduce((sum, polygon) => sum + polygonAreaKm2(polygon), 0)
  none.push(...borderRings(all.filter(inBoxes(properties.ADMIN))))
  const south = BORDER_NONE_SOUTH_OF[properties.ADMIN]
  if (south !== undefined)
    none.push(...borderRings(all.map((polygon) => [southOf(polygon[0], south)]).filter(([ring]) => ring !== null)))
  const border = { flag, rings: borderRings(all.filter((polygon) => !inBoxes(properties.ADMIN)(polygon))) }
  borders.push(border)
  const kept = area >= POINT_BELOW_KM2 ? keptParts(feature.geometry, CHAIN_KM_FOR[properties.ADMIN]) : null
  const keptShare = kept ? kept.reduce((sum, polygon) => sum + polygonAreaKm2(polygon), 0) / area : 0
  const why =
    area < POINT_BELOW_KM2
      ? "small"
      : DISPUTED.has(properties.ADMIN)
        ? "disputed"
        : crossesAntimeridian(kept)
          ? "antimeridian"
          : keptShare < MIN_KEPT_SHARE
            ? "scattered"
            : properties.ADMIN === "United States of America"
              ? "far-flung" // Alaska and Hawaii; the outline below keeps the contiguous states
              : null

  const place = { id: slug(label), label, wiki, flag: { code: flag, wiki: flagWiki } }
  places.push(place)

  if (!why || why === "far-flung") {
    const cells = kept.flatMap((polygon) => cellsOf(polygon, 6))
    const keptArea = areaOf(cells)
    const tolerance = regionToleranceKm(keptArea)
    const contiguous = properties.ADMIN === "United States of America"
    const id = names.id ?? (contiguous ? "usa-region" : `${slug(label)}-region`)
    outlines[id] = kept
      .map((polygon) => polygon.map((ring) => simplifyRing(ring, SIMPLIFY_DEG)).filter(Boolean))
      .filter((polygon) => polygon.length > 0)
    const area = { outline: id, centre: centroid(cells), tolerance, surface: "LAND" }
    // The contiguous states are a place of their own, not the country its flag stands for.
    const painted = contiguous
      ? {
          id: "contiguous-united-states",
          label: "Contiguous United States",
          wiki: "Contiguous United States",
          area,
          flag: place.flag
        }
      : Object.assign(place, { area })
    if (contiguous) places.push(painted)
    regions.push({
      id,
      type: "COUNTRY",
      place: painted.id,
      clue: { type: "NAME", prompt: `Paint the whole of ${contiguous ? "the contiguous United States" : name}` },
      answer: { type: "AREA" }
    })
  }

  if (!why) {
    flags.push({ id: `flag-${flag}`, type: "FLAG", place: place.id, clue: { type: "FLAG" }, answer: { type: "AREA" } })
    console.log(
      `${label}: painted, ${kept.length} part(s), ${Math.round(100 * keptShare)}% of its land, tolerance ${place.area.tolerance} km`
    )
  } else {
    // Small and scattered countries are asked on land near their label
    // point (a centroid could fall in the sea between islands); larger ones
    // at their centre.
    const island = why === "small" || why === "scattered"
    const answer =
      names.at ?? (island ? islandAnswer(properties, all) : centroid(all.flatMap((polygon) => cellsOf(polygon, 4))))
    const spread = Math.max(
      ...all.flatMap((polygon) => polygon[0].map((point) => distanceKm([answer.lon, answer.lat], point)))
    )
    const tolerance = pointToleranceKm(area, spread, island)
    flags.push({
      id: `flag-${flag}`,
      type: "FLAG",
      place: place.id,
      clue: { type: "FLAG" },
      answer: { type: "POINT", tolerance }
    })
    place.at = answer
    if (island) border.near = tolerance
    console.log(
      `${label}: point (${why}), ${Math.round(area)} km², spread ${Math.round(spread)} km, tolerance ${tolerance} km`
    )
  }
}

writeQuestions(["COUNTRY", "FLAG"], [...regions, ...flags], places, outlines)
const bordersJson = JSON.stringify({ countries: borders, none })
writeFileSync(new URL("../borders.json", import.meta.url), bordersJson + "\n")
console.log(`wrote ${borders.length} to borders.json, ${Math.round(bordersJson.length / 1024)} KB`)
