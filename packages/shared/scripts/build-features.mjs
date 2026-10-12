// Builds features.json: the "Islands, lakes and seas" and "US states" rounds,
// from Natural Earth (public domain).
//
// Usage: node scripts/build-features.mjs [dir with the geojson files in FILES]
// Without a directory it downloads them from the Natural Earth repository.
//
// Each is painted whole, like a country (see build-regions.mjs), with the same
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
// - US states: 1:50m admin-1 with the Great Lakes cut out; not DC.
import { readFileSync, writeFileSync } from "node:fs"
import {
  MIN_KEPT_SHARE,
  POINT_BELOW_KM2,
  SIMPLIFY_DEG,
  areaOf,
  cellsOf,
  centroid,
  crossesAntimeridian,
  keptParts,
  km,
  onLand,
  pointToleranceKm,
  polygonAreaKm2,
  polygonsOf,
  regionToleranceKm,
  simplifyRing,
  slug
} from "./outline.mjs"

const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson"
const FILES = {
  land: "ne_50m_land",
  lakes: "ne_50m_lakes",
  seas: "ne_10m_geography_marine_polys",
  states: "ne_50m_admin_1_states_provinces_lakes"
}

/** Label, a point on the island [lon, lat], and where the default would not do, prompt name and Wikipedia title. */
const ISLANDS = [
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
const SEAS = [
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
const STATE_NAMES = {
  Georgia: { label: "Georgia (US state)", name: "the US state of Georgia", wiki: "Georgia (U.S. state)" },
  Washington: { label: "Washington State", name: "Washington State", wiki: "Washington (state)" },
  "New York": { label: "New York State", name: "New York State", wiki: "New York (state)" }
}

async function features(name) {
  const dir = process.argv[2]
  const text = dir
    ? readFileSync(`${dir}/${name}.geojson`, "utf8")
    : await (await fetch(`${NE}/${name}.geojson`)).text()
  return JSON.parse(text).features
}

const simplified = (polygons) =>
  polygons
    .map((poly) => poly.map((ring) => simplifyRing(ring, SIMPLIFY_DEG)).filter(Boolean))
    .filter((p) => p.length > 0)

/** A place painted whole. */
function region(topic, label, name, wiki, polygons) {
  const cells = polygons.flatMap((poly) => cellsOf(poly, 6))
  const area = areaOf(cells)
  if (area < POINT_BELOW_KM2) throw new Error(`${label} is too small to paint: ${Math.round(area)} km²`)
  const q = {
    id: `${topic}-${slug(label)}`,
    kind: "region",
    topic,
    prompt: `Paint the whole of ${name}`,
    label,
    wiki,
    answer: centroid(cells),
    toleranceKm: regionToleranceKm(area),
    outline: simplified(polygons)
  }
  console.log(`${label}: ${topic}, ${polygons.length} part(s), ${Math.round(area)} km², tolerance ${q.toleranceKm} km`)
  return q
}

const out = []

const land = (await features(FILES.land)).flatMap((f) => polygonsOf(f.geometry))
for (const [label, at, names = {}] of ISLANDS) {
  const polygon = land.find((poly) => onLand(at, [poly]))
  if (!polygon) throw new Error(`${label}: no land at ${at}`)
  if (polygonAreaKm2(polygon) > 3e6) throw new Error(`${label}: ${at} is on a continent`)
  out.push(region("island", label, names.name ?? label, names.wiki ?? label, [polygon]))
}

const lakes = new Map()
for (const f of await features(FILES.lakes)) {
  const name = f.properties.name
  if (!name || f.properties.featurecla === "Reservoir") continue
  lakes.set(name, [...(lakes.get(name) ?? []), ...polygonsOf(f.geometry)])
}
for (const [name, polygons] of [...lakes].sort(([a], [b]) => a.localeCompare(b))) {
  const area = polygons.reduce((s, p) => s + polygonAreaKm2(p), 0)
  if (area < POINT_BELOW_KM2) continue
  out.push(region("lake", name, name, name, polygons))
}

const marine = await features(FILES.seas)
for (const [label, parts] of SEAS) {
  const polygons = parts.flatMap((part) => {
    const f = marine.filter((m) => m.properties.name === part)
    if (f.length === 0) throw new Error(`${label}: no marine area named ${part}`)
    return f.flatMap((m) => polygonsOf(m.geometry))
  })
  out.push(region("sea", label, `the ${label}`, label, polygons))
}

const states = (await features(FILES.states)).filter(
  (f) => f.properties.adm0_a3 === "USA" && f.properties.name !== "District of Columbia"
)
for (const f of states.sort((a, b) => a.properties.name.localeCompare(b.properties.name))) {
  const p = f.properties
  const names = STATE_NAMES[p.name] ?? {}
  const label = names.label ?? p.name
  const wiki = names.wiki ?? p.name
  const all = polygonsOf(f.geometry)
  const area = all.reduce((s, poly) => s + polygonAreaKm2(poly), 0)
  const kept = area >= POINT_BELOW_KM2 ? keptParts(f.geometry) : null
  const keptShare = kept ? kept.reduce((s, poly) => s + polygonAreaKm2(poly), 0) / area : 0
  if (kept && keptShare >= MIN_KEPT_SHARE && !crossesAntimeridian(kept)) {
    out.push(region("state", label, names.name ?? p.name, wiki, kept))
    continue
  }
  const answer = centroid(all.flatMap((poly) => cellsOf(poly, 9)))
  if (!onLand([answer.lon, answer.lat], all)) throw new Error(`${label}: its centre is not on its land`)
  const spread = Math.max(...all.flatMap((poly) => poly[0].map((pt) => km([answer.lon, answer.lat], pt))))
  const toleranceKm = pointToleranceKm(area, spread, false)
  out.push({
    id: `state-${slug(label)}`,
    kind: "text",
    topic: "state",
    prompt: `Where is ${names.name ?? p.name}?`,
    answer,
    toleranceKm,
    label,
    wiki,
    region: "world"
  })
  console.log(`${label}: state, point, ${Math.round(area)} km², tolerance ${toleranceKm} km`)
}

const json = JSON.stringify(out)
writeFileSync(new URL("../features.json", import.meta.url), json + "\n")
console.log(`wrote ${out.length} to features.json, ${Math.round(json.length / 1024)} KB`)
