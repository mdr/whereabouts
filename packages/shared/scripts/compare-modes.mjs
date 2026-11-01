// The same kinds of guess scored as a point question and as a whole-country
// question, to compare how the two rules treat near misses, vagueness and
// hedges (docs/country-scoring.md). Distances are in each question's own
// tolerance. The real places in section 5 are round Paris and France.
//
// Usage, from packages/shared:
//   node --experimental-transform-types scripts/compare-modes.mjs                         Paris and France, Germany as the neighbour
//   node --experimental-transform-types scripts/compare-modes.mjs berlin Germany Poland   a place id, a country, a neighbour
import * as h3 from "h3-js"
import { buildDistribution, scoreDistribution } from "../src/scoring/scoring.ts"
import { resolutionForTolerance } from "../src/paint/paint.ts"
import { regionCells, regionFit, scoreArea } from "../src/scoring/regions.ts"
import { COUNTRIES, PLACES } from "./catalogue.mjs"

const country = (label) => COUNTRIES.find((candidate) => candidate.label === label) ?? fail(label)
const place = (id) => PLACES.find((candidate) => candidate.id === id) ?? fail(id)
function fail(what) {
  throw new Error(`not found: ${what}`)
}

const [pointId, countryLabel] = process.argv.slice(2).filter((argument) => argument !== "--")
const P = place(pointId ?? "paris")
const C = country(countryLabel ?? "France")
const resolution = Math.max(resolutionForTolerance(P.tolerance), resolutionForTolerance(C.tolerance))
const area = (cells) => cells.reduce((sum, cell) => sum + h3.cellArea(cell, h3.UNITS.km2), 0)
const spacing = h3.getHexagonEdgeLengthAvg(resolution, h3.UNITS.km) * Math.sqrt(3)
const cCells = regionCells(C, resolution)
const R = Math.sqrt(area(cCells) / Math.PI)
const r = P.tolerance
const rc = C.tolerance

/** Paint parts [{cells, weight}], each spread evenly by area. */
function coat(parts) {
  const byCell = new Map()
  for (const { cells, weight } of parts) {
    const cellsArea = area(cells)
    for (const cell of cells) byCell.set(cell, (byCell.get(cell) ?? 0) + weight / cellsArea)
  }
  return buildDistribution(
    [...byCell].map(([cell, density]) => {
      const [lat, lon] = h3.cellToLatLng(cell)
      return { lat, lon, intensity: density, area: h3.cellArea(cell, h3.UNITS.km2), h3: cell }
    }),
    0.05
  )
}
const even = (cells) => coat([{ cells, weight: 1 }])
const mix = (...pairs) => coat(pairs.map(([cells, weight]) => ({ cells, weight })))

const east = (point, km) => ({ lat: point.lat, lon: point.lon + km / (111.32 * Math.cos((point.lat * Math.PI) / 180)) })
const disc = (centre, km) =>
  h3.gridDisk(h3.latLngToCell(centre.lat, centre.lon, resolution), Math.max(0, Math.round(km / spacing)))
const shiftedCountry = (q, km) =>
  regionCells(
    {
      ...q,
      polygons: q.polygons.map((polygon) =>
        polygon.map((ring) => ring.map(([lon, lat]) => [east({ lat, lon }, km).lon, lat]))
      )
    },
    resolution
  )
function grow(cells, km) {
  const set = new Set(cells)
  let frontier = cells.filter((cell) => h3.gridDisk(cell, 1).some((neighbour) => !set.has(neighbour)))
  for (let i = 0; i < Math.max(1, Math.round(km / spacing)); i++) {
    const next = []
    for (const cell of frontier)
      for (const neighbour of h3.gridDisk(cell, 1))
        if (!set.has(neighbour)) {
          set.add(neighbour)
          next.push(neighbour)
        }
    frontier = next
  }
  return [...set]
}
const westPart = (cells, fraction) => {
  const sorted = cells.map((cell) => ({ cell, lon: h3.cellToLatLng(cell)[1] })).sort((a, b) => a.lon - b.lon)
  return sorted.slice(0, Math.round(sorted.length * fraction)).map((entry) => entry.cell)
}

const pointScore = (distribution) => scoreDistribution(distribution, P.answer, r).score
const areaScore = (distribution) => {
  const areaPart = scoreArea(distribution, C)
  return { ...areaPart, ...regionFit(distribution, C) }
}
const fmt = (score) => String(Math.round(score)).padStart(5)
const areaCols = (result) => `${fmt(result.score)}  (shape ${fmt(result.shape)}, nearness ${fmt(result.nearness)})`

console.log(
  `Point: ${P.label}, r = ${r} km.  Area: ${C.label}, r = ${rc} km, R = ${Math.round(R)} km.  Painting resolution ${resolution}.\n`
)

console.log("1. Confident miss: a tight blob (point) / the exact shape (area), moved k tolerances east")
console.log("   k    point   area                                       (k in R for area)")
for (const k of [0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32]) {
  const pointResult = pointScore(even(disc(east(P.answer, k * r), r / 2)))
  const areaResult = areaScore(even(shiftedCountry(C, k * rc)))
  console.log(`${String(k).padStart(4)}  ${fmt(pointResult)}   ${areaCols(areaResult)}   ${((k * rc) / R).toFixed(2)}R`)
}

console.log(
  "\n2. Vagueness, centred on the answer: blob of radius s (point) / border pushed out s (area), s in tolerances"
)
for (const radius of [0.5, 1, 2, 3, 4, 6, 8, 12, 16]) {
  const pointResult = pointScore(even(disc(P.answer, radius * r)))
  const areaResult = areaScore(even(grow(cCells, radius * rc)))
  console.log(
    `${String(radius).padStart(4)}  ${fmt(pointResult)}   ${areaCols(areaResult)}   on-country ${Math.round(areaResult.precision * 100)}%`
  )
}

console.log("\n3. Hedge: weight w on the answer, 1−w on the same guess D tolerances east")
console.log("        D:      2         4          8         far (5000 km)")
console.log("   w   point/area per D")
for (const w of [1, 0.75, 0.5, 0.25, 0]) {
  const cells = []
  for (const D of [2, 4, 8, null]) {
    const pk = D === null ? 5000 : D * r
    const ak = D === null ? 5000 : D * rc
    const pointResult = pointScore(
      mix(
        ...[
          [disc(P.answer, r / 2), w],
          [disc(east(P.answer, pk), r / 2), 1 - w]
        ].filter(([, weight]) => weight > 0)
      )
    )
    const areaResult = areaScore(
      mix(
        ...[
          [cCells, w],
          [shiftedCountry(C, ak), 1 - w]
        ].filter(([, weight]) => weight > 0)
      )
    ).score
    cells.push(`${fmt(pointResult)}/${fmt(areaResult)}`)
  }
  console.log(`${w.toFixed(2).padStart(5)}  ${cells.join("  ")}`)
}

console.log("\n4. Two wrong guesses either side, 50/50, D tolerances east and west (point / area)")
for (const D of [1, 2, 4, 8]) {
  const pointResult = pointScore(
    mix([disc(east(P.answer, D * r), r / 2), 0.5], [disc(east(P.answer, -D * r), r / 2), 0.5])
  )
  const areaResult = areaScore(mix([shiftedCountry(C, D * rc), 0.5], [shiftedCountry(C, -D * rc), 0.5]))
  console.log(`${String(D).padStart(4)}  ${fmt(pointResult)}   ${areaCols(areaResult)}`)
}

// Real places and countries.
const city = (lat, lon) => disc({ lat, lon }, r / 2)
const CITIES = {
  Paris: city(48.8566, 2.3522),
  Brussels: city(50.8503, 4.3517),
  Lyon: city(45.764, 4.8357),
  Marseille: city(43.2965, 5.3698),
  London: city(51.5072, -0.1276),
  Berlin: city(52.52, 13.405),
  Madrid: city(40.4168, -3.7038),
  Rome: city(41.9028, 12.4964),
  "New York": city(40.7128, -74.006)
}
const countryCells = (label) => regionCells(country(label), resolution)
const EU = [
  ...new Set(
    [
      "France",
      "Spain",
      "Germany",
      "Italy",
      "Belgium",
      "Netherlands",
      "Switzerland",
      "Portugal",
      "United Kingdom",
      "Austria"
    ].flatMap(countryCells)
  )
]

console.log(`\n5. Real paints, scored both ways (point = ${P.label}, area = ${C.label})`)
const real = [
  ["Paris blob", even(CITIES.Paris)],
  ["Brussels blob", even(CITIES.Brussels)],
  ["Lyon blob", even(CITIES.Lyon)],
  ["London blob", even(CITIES.London)],
  ["Berlin blob", even(CITIES.Berlin)],
  ["Madrid blob", even(CITIES.Madrid)],
  ["New York blob", even(CITIES["New York"])],
  ["Paris + Lyon 50/50", mix([CITIES.Paris, 0.5], [CITIES.Lyon, 0.5])],
  ["Paris + Berlin 50/50", mix([CITIES.Paris, 0.5], [CITIES.Berlin, 0.5])],
  ["Lyon + Brussels 50/50", mix([CITIES.Lyon, 0.5], [CITIES.Brussels, 0.5])],
  ["France", even(countryCells("France"))],
  ["Belgium", even(countryCells("Belgium"))],
  ["Switzerland", even(countryCells("Switzerland"))],
  ["Germany", even(countryCells("Germany"))],
  ["Spain", even(countryCells("Spain"))],
  ["Italy", even(countryCells("Italy"))],
  ["United Kingdom", even(countryCells("United Kingdom"))],
  ["France + Germany 50/50", mix([countryCells("France"), 0.5], [countryCells("Germany"), 0.5])],
  ["France + Spain 50/50", mix([countryCells("France"), 0.5], [countryCells("Spain"), 0.5])],
  ["Germany + Spain 50/50", mix([countryCells("Germany"), 0.5], [countryCells("Spain"), 0.5])],
  [
    "France 70% + Germany/Spain/Italy 10% each",
    mix(
      [countryCells("France"), 0.7],
      [countryCells("Germany"), 0.1],
      [countryCells("Spain"), 0.1],
      [countryCells("Italy"), 0.1]
    )
  ],
  [`west half of ${C.label}`, even(westPart(cCells, 0.5))],
  [`${C.label}, border out 1R`, even(grow(cCells, R))],
  [`circle of radius R at ${C.label}'s centre`, even(disc(C.centre, R))],
  [`circle of radius R/2 at ${C.label}'s centre`, even(disc(C.centre, R / 2))],
  ["Western Europe evenly", even(EU)],
  ["the world evenly", even(h3.getRes0Cells().flatMap((cell) => h3.cellToChildren(cell, 2)))]
]
console.log(`${"".padEnd(44)}point   area`)
for (const [name, distribution] of real) {
  const result = areaScore(distribution)
  console.log(
    `${name.padEnd(44)}${fmt(pointScore(distribution))}   ${areaCols(result)}  cov ${Math.round(result.coverage * 100)}% prec ${Math.round(result.precision * 100)}%`
  )
}

console.log(`\n6. Does nearness of the wrong half of a hedge matter? (area, ${C.label})`)
const neighbour = process.argv[4] ?? "Germany"
const neighbourCells = countryCells(neighbour)
const farCopy = (cells, km) => {
  const out = new Set()
  for (const cell of cells) {
    const [lat, lon] = h3.cellToLatLng(cell)
    const shifted = east({ lat, lon }, km)
    out.add(h3.latLngToCell(shifted.lat, shifted.lon, resolution))
  }
  return [...out]
}
for (const [name, distribution] of [
  [`${C.label} + ${neighbour} 50/50`, mix([cCells, 0.5], [neighbourCells, 0.5])],
  [`${C.label} + ${neighbour}'s shape 5000 km east 50/50`, mix([cCells, 0.5], [farCopy(neighbourCells, 5000), 0.5])],
  [`${neighbour} alone`, even(neighbourCells)],
  [`${neighbour}'s shape 5000 km east alone`, even(farCopy(neighbourCells, 5000))]
])
  console.log(`${name.padEnd(52)}${areaCols(areaScore(distribution))}`)

console.log(`\n7. Covering part of ${C.label} evenly (area): a centred circle, or the western part`)
for (const share of [1, 0.8, 0.65, 0.5, 0.4, 1 / 3, 0.25, 0.1]) {
  const circle = even(disc(C.centre, R * Math.sqrt(share)))
  const west = even(westPart(cCells, share))
  const circleResult = areaScore(circle),
    westResult = areaScore(west)
  console.log(
    `c=${share.toFixed(2)}  circle ${areaCols(circleResult)} cov ${Math.round(circleResult.coverage * 100)}%   west ${areaCols(westResult)}`
  )
}
