// Builds the catalogue's "Islands, lakes and seas" and "US states"
// questions, with their outlines, from Natural Earth (public domain). See
// write-catalogue.ts.
//
// Usage: node --experimental-transform-types scripts/build-features.ts [dir with the geojson files in FILES]
// Without a directory it downloads them from the Natural Earth repository.
//
// Each is painted whole, like a country (see build-regions.ts), with the same
// rules: a state smaller than POINT_BELOW_KM2, or too scattered to outline, is
// asked as a point instead.
//
// - Islands: the 1:50m land polygon holding a point on the island, so the
//   coast is the one country outlines use. The largest islands, leaving out
//   those painted as a country already (Madagascar, Cuba, Iceland, Sri Lanka,
//   Great Britain, Ireland), Australia, and Chukotka (Asia, split at the
//   antimeridian).
// - Lakes: every 1:50m lake (not reservoir) of at least POINT_BELOW_KM2. Shown only on a map
//   detail that draws lakes (see questions.ts).
// - Seas: the nearly closed ones, each the union of 1:10m marine areas, since
//   Natural Earth splits off the Adriatic, the Gulf of Bothnia and the like.
// - US states: 1:10m admin-1 with the Great Lakes cut out; not DC.
import polygonClipping from "polygon-clipping"
import type { LonLat, MultiPolygon } from "../src/geo.ts"
import { AnswerType, ClueType, FeatureType, QuestionType, Surface } from "../src/questions.ts"
import { loadFeatures } from "./natural-earth.ts"
import { writeQuestions, type Outlines, type StoredPlace, type StoredQuestion } from "./write-catalogue.ts"
import {
  MIN_KEPT_SHARE,
  POINT_BELOW_KM2,
  areaOf,
  cellsOf,
  centroid,
  crossesAntimeridian,
  keptParts,
  distanceKm,
  onLand,
  pointToleranceKm,
  polygonAreaKm2,
  polygonsOf,
  regionToleranceKm,
  simplified,
  slug
} from "./outline.ts"

const FILES = {
  land: "ne_50m_land",
  lakes: "ne_50m_lakes",
  seas: "ne_10m_geography_marine_polys",
  states: "ne_10m_admin_1_states_provinces_lakes"
}

/** Label, a point on the island [lon, lat], and where the default would not do, prompt name and Wikipedia title. */
const ISLANDS: [label: string, at: LonLat, names?: { name?: string; wiki?: string }][] = [
  ["Greenland", [-42, 72]],
  ["New Guinea", [140, -5]],
  ["Borneo", [114, 1]],
  ["Baffin Island", [-72, 68]],
  ["Sumatra", [102, 0]],
  ["Honshu", [139, 36.5]],
  ["Victoria Island", [-110, 71], { wiki: "Victoria Island (Canada)" }],
  ["Ellesmere Island", [-80, 80]],
  ["Sulawesi", [120, -1.5]],
  ["South Island", [171, -43.5], { name: "New Zealand's South Island" }],
  ["Java", [110, -7.3]],
  ["North Island", [175.5, -39], { name: "New Zealand's North Island" }],
  ["Newfoundland", [-56, 48.8], { wiki: "Newfoundland (island)" }],
  ["Luzon", [121, 16]],
  ["Mindanao", [125, 7.8]],
  ["Hokkaido", [143, 43.5]],
  ["Sakhalin", [142.8, 50]],
  ["Hispaniola", [-71, 19]],
  ["Banks Island", [-121, 73]],
  ["Tasmania", [146.5, -42]]
]

/** Label and the 1:10m marine areas that make up each sea. */
const SEAS: [label: string, parts: string[]][] = [
  [
    "Mediterranean Sea",
    [
      "Mediterranean Sea",
      "Alboran Sea",
      "Balearic Sea",
      "Golfe du Lion",
      "Ligurian Sea",
      "Tyrrhenian Sea",
      "Adriatic Sea",
      "Ionian Sea",
      "Gulf of Sidra",
      "Gulf of Gabès",
      "Aegean Sea",
      "Sea of Crete"
    ]
  ],
  ["Black Sea", ["Black Sea"]],
  ["Caspian Sea", ["Caspian Sea"]],
  ["Red Sea", ["Red Sea", "Gulf of Suez", "Gulf of Aqaba"]],
  ["Persian Gulf", ["Persian Gulf"]],
  ["Baltic Sea", ["Baltic Sea", "Gulf of Bothnia", "Gulf of Finland", "Gulf of Riga", "Mecklenburger Bucht"]],
  ["Hudson Bay", ["Hudson Bay", "James Bay"]]
]

/** States whose name is shared with a country or a city. */
const STATE_NAMES: Record<string, { label: string; name: string; wiki: string }> = {
  Georgia: { label: "Georgia (US state)", name: "the US state of Georgia", wiki: "Georgia (U.S. state)" },
  Washington: { label: "Washington State", name: "Washington State", wiki: "Washington (state)" },
  "New York": { label: "New York State", name: "New York State", wiki: "New York (state)" }
}

interface LakeProperties {
  name?: string
  featurecla: string
}

interface StateProperties {
  adm0_a3: string
  name: string
}

const outlines: Outlines = {}
const places: StoredPlace[] = []

enum Topic {
  ISLAND = "ISLAND",
  LAKE = "LAKE",
  SEA = "SEA",
  STATE = "STATE"
}

/** Each topic's id prefix, the feature it is on a place, and what its area is painted on. */
const TOPICS: Record<Topic, { prefix: string; feature?: FeatureType; surface: Surface }> = {
  [Topic.ISLAND]: { prefix: "island", feature: FeatureType.ISLAND, surface: Surface.LAND },
  [Topic.LAKE]: { prefix: "lake", feature: FeatureType.LAKE, surface: Surface.WATER },
  [Topic.SEA]: { prefix: "sea", feature: FeatureType.SEA, surface: Surface.WATER },
  [Topic.STATE]: { prefix: "state", surface: Surface.LAND }
}

/** A place painted whole: an island, lake or sea (`feature`), or a state. */
const region = (topic: Topic, label: string, name: string, wiki: string, polygons: MultiPolygon): StoredQuestion => {
  const { prefix, feature, surface } = TOPICS[topic]
  const cells = polygons.flatMap((polygon) => cellsOf(polygon, 6))
  const area = areaOf(cells)
  if (area < POINT_BELOW_KM2) throw new Error(`${label} is too small to paint: ${Math.round(area)} km²`)
  const id = `${prefix}-${slug(label)}`
  const tolerance = regionToleranceKm(area)
  outlines[id] = simplified(polygons)
  console.log(`${label}: ${prefix}, ${polygons.length} part(s), ${Math.round(area)} km², tolerance ${tolerance} km`)
  places.push({
    id,
    label,
    wiki,
    ...(feature ? { feature } : {}),
    area: { outline: id, centre: centroid(cells), tolerance, surface }
  })
  return {
    id,
    type: topic === Topic.STATE ? QuestionType.STATE : QuestionType.FEATURE,
    place: id,
    clue: { type: ClueType.NAME, prompt: `Paint the whole of ${name}` },
    answer: { type: AnswerType.AREA }
  }
}

const out: StoredQuestion[] = []

const land = (await loadFeatures(FILES.land, process.argv[2])).flatMap((feature) => polygonsOf(feature.geometry))
for (const [label, at, names = {}] of ISLANDS) {
  const polygon = land.find((candidate) => onLand(at, [candidate]))
  if (!polygon) throw new Error(`${label}: no land at ${at}`)
  if (polygonAreaKm2(polygon) > 3e6) throw new Error(`${label}: ${at} is on a continent`)
  out.push(region(Topic.ISLAND, label, names.name ?? label, names.wiki ?? label, [polygon]))
}

const lakes = new Map<string, MultiPolygon>()
for (const feature of await loadFeatures<LakeProperties>(FILES.lakes, process.argv[2])) {
  const name = feature.properties.name
  if (!name || feature.properties.featurecla === "Reservoir") continue
  lakes.set(name, [...(lakes.get(name) ?? []), ...polygonsOf(feature.geometry)])
}
for (const [name, polygons] of [...lakes].sort(([a], [b]) => a.localeCompare(b))) {
  const area = polygons.reduce((sum, polygon) => sum + polygonAreaKm2(polygon), 0)
  if (area < POINT_BELOW_KM2) continue
  out.push(region(Topic.LAKE, name, name, name, polygons))
}

const marine = await loadFeatures<{ name: string }>(FILES.seas, process.argv[2])
for (const [label, parts] of SEAS) {
  const polygons = parts.flatMap((part) => {
    const matching = marine.filter((feature) => feature.properties.name === part)
    if (matching.length === 0) throw new Error(`${label}: no marine area named ${part}`)
    return matching.flatMap((feature) => polygonsOf(feature.geometry))
  })
  out.push(region(Topic.SEA, label, `the ${label}`, label, polygonClipping.union(polygons[0]!, ...polygons.slice(1))))
}

const states = (await loadFeatures<StateProperties>(FILES.states, process.argv[2])).filter(
  (feature) => feature.properties.adm0_a3 === "USA" && feature.properties.name !== "District of Columbia"
)
for (const feature of states.sort((a, b) => a.properties.name.localeCompare(b.properties.name))) {
  const properties = feature.properties
  const names = STATE_NAMES[properties.name]
  const label = names?.label ?? properties.name
  const wiki = names?.wiki ?? properties.name
  const promptName = names?.name ?? properties.name
  const all = polygonsOf(feature.geometry)
  const area = all.reduce((sum, polygon) => sum + polygonAreaKm2(polygon), 0)
  const kept = area >= POINT_BELOW_KM2 ? keptParts(feature.geometry) : []
  const keptShare = kept.length > 0 ? kept.reduce((sum, polygon) => sum + polygonAreaKm2(polygon), 0) / area : 0
  if (kept.length > 0 && keptShare >= MIN_KEPT_SHARE && !crossesAntimeridian(kept)) {
    out.push(region(Topic.STATE, label, promptName, wiki, kept))
    continue
  }
  const answer = centroid(all.flatMap((polygon) => cellsOf(polygon, 9)))
  if (!onLand([answer.lon, answer.lat], all)) throw new Error(`${label}: its centre is not on its land`)
  const spread = Math.max(
    ...all.flatMap((polygon) => polygon[0]!.map((point) => distanceKm([answer.lon, answer.lat], point)))
  )
  const tolerance = pointToleranceKm(area, spread, false)
  const id = `state-${slug(label)}`
  places.push({ id, label, wiki, at: answer })
  out.push({
    id,
    type: QuestionType.STATE,
    place: id,
    clue: { type: ClueType.NAME, prompt: `Where is ${promptName}?` },
    answer: { type: AnswerType.POINT, tolerance }
  })
  console.log(`${label}: state, point, ${Math.round(area)} km², tolerance ${tolerance} km`)
}

writeQuestions([QuestionType.FEATURE, QuestionType.STATE], out, places, outlines)
