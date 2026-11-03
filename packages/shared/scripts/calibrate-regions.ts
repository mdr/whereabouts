// Calibration for "Paint the whole of …" scoring (docs/country-scoring.md).
// Scores synthetic paints and real wrong countries with the game's own rule
// (scoreArea) and reports each against the target range it was
// tuned to, so a change to a constant in src/scoring/regions.ts can be judged.
//
// Usage, from packages/shared:
//   pnpm calibrate                      the summary over nine countries
//   pnpm calibrate -- --detail          also every country's own scores
//   pnpm calibrate -- Germany Chile     just these countries (Natural Earth names as labelled)
//
// Synthetic paints are built from the country's own outline at its painting
// resolution, spread evenly unless the case says otherwise, with the usual 5%
// world floor. Distances are in R, the country's equivalent radius.
import * as h3 from "h3-js"
import { PASS_SCORE, buildDistribution } from "../src/scoring/scoring.ts"
import { PaintLayer, resolutionForTolerance } from "../src/paint/paint.ts"
import { regionCells, regionFit, scoreArea } from "../src/scoring/regions.ts"
import { COUNTRIES as AREAS } from "./catalogue.mjs"

const byLabel = (label) => {
  const q = AREAS.find((country) => country.label === label)
  if (!q) throw new Error(`no country labelled ${label}`)
  return q
}

const args = process.argv.slice(2).filter((argument) => argument !== "--")
const DETAIL = args.includes("--detail")
const chosen = args.filter((argument) => !argument.startsWith("--"))
const COUNTRIES = chosen.length
  ? chosen
  : ["Germany", "Italy", "Chile", "Egypt", "Indonesia", "United Kingdom", "Brazil", "Australia", "South Africa"]

// Countries where a paint shrunk or centred on the middle makes sense (not thin or island chains).
const COMPACT = ["Germany", "Egypt", "Brazil", "South Africa", "Australia"]

// [case, low, high, only for these countries?]: the targets in the doc's
// "What a good rule has to do", as ranges round the indicative score. The
// country's shape moved 2R plays a neighbour; misses are in R so that they
// match the point rule at the tolerance a country gets as a point (R / 2).
// Cases with no range have no target yet and are only reported.
const TARGETS = [
  ["exact shape", 985, 1000],
  ["bloated until about 28% is off", 885, 965],
  ["bloated until about half is off", 810, 890],
  ["west 75% only", 830, 910],
  ["west half only", 710, 790],
  ["circle a tenth of the area, centred", 600, 700, COMPACT],
  ["50/50: the country and its shape 2R away", 735, 815],
  ["50/50: the country and its shape 5000 km away", 710, 790],
  ["80/20: the country and its shape 2R away", 910, 980],
  ["20/80: the country and its shape 2R away", 560, 640],
  ["its shape 2R away only", 450, 550],
  ["solid, with a 10% wash over 4x the area", 880, 960],
  ["solid, with a 25% wash over 4x the area", 820, 900],
  ["solid, with a 50% wash over 4x the area", 760, 840],
  ["4x the area evenly, centred", 650, 750],
  ["the whole world painted evenly", 250, 350],
  ["shape shifted 3.4R east", 350, 450],
  ["shape shifted 6.5R east", 220, 320],
  ["shape shifted 9.6R east", 140, 230],
  ["shape at the antipode", 40, 120],
  // Today's rule brushes about right; these sit round its scores.
  ["brushed once", 910, 970],
  ["brushed, with a second pass through the middle", 895, 955],
  ["brushed, with two more passes over the north", 875, 935],
  ["missing the southern third"],
  ["shape shifted 0.25R east"],
  ["shape shifted 0.5R east"],
  ["shape shifted 1R east"],
  ["circle of the same area, centred", null, null, COMPACT],
  ["bright middle, half density at the edges"],
  ["big faint blob far away (8x the area)"]
]

// [what should hold, lower case, higher case]: orderings the targets imply.
const ORDERS = [
  [
    "squeezing the wrong half costs a little",
    "50/50: the country and half its shape 2R away, squeezed",
    "50/50: the country and its shape 2R away"
  ],
  [
    "nearer wrong paint costs less",
    "50/50: the country and its shape 5000 km away",
    "50/50: the country and its shape 2R away"
  ],
  ["a pass beats a wild guess", "shape at the antipode", "pass"]
]

// Real wrong answers: [question, neighbours, far away and of broadly similar size].
const NEIGHBOURS = [
  ["Germany", ["Poland", "France"], ["Japan", "Iran"]],
  ["Brazil", ["Argentina", "Peru", "Colombia"], ["Australia", "Kazakhstan"]],
  ["Chile", ["Argentina", "Peru"], ["Norway", "Japan"]],
  ["Egypt", ["Libya", "Saudi Arabia"], ["Mongolia", "Iran"]],
  ["United Kingdom", ["Ireland", "France"], ["Japan", "Cuba"]],
  ["Spain", ["France"], ["Turkey", "Madagascar"]],
  ["Poland", ["Germany"], ["Finland", "Vietnam"]]
]

// ---- building paints --------------------------------------------------------

const area = (cells) => cells.reduce((sum, cell) => sum + h3.cellArea(cell, h3.UNITS.km2), 0)
const spacing = (resolution) => h3.getHexagonEdgeLengthAvg(resolution, h3.UNITS.km) * Math.sqrt(3)

/** Paint each part's cells evenly by area with `weight` of the painted mass; intensity(h) varies it. */
const coat = (parts, intensity = () => 1) => {
  const byCell = new Map()
  for (const { cells, weight } of parts) {
    const cellsArea = area(cells)
    for (const cell of cells) byCell.set(cell, (byCell.get(cell) ?? 0) + (weight * intensity(cell)) / cellsArea)
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

/** The cells plus every cell within `rings` rings of them. */
const growRings = (cells, rings) => {
  const set = new Set(cells)
  let frontier = cells.filter((cell) => h3.gridDisk(cell, 1).some((neighbour) => !set.has(neighbour)))
  for (let i = 0; i < rings; i++) {
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

/** Grow outward until the country is `share` of the painted area. */
const bloatTo = (cells, share) => {
  const target = area(cells) / share
  let out = cells
  for (let i = 1; area(out) < target && i < 200; i++) out = growRings(cells, i)
  return out
}

/** The share `fraction` of the country's area furthest along `key`. */
const portion = (cells, fraction, key) => {
  const sorted = cells
    .map((cell) => {
      const [lat, lon] = h3.cellToLatLng(cell)
      return { cell, along: key(lat, lon), area: h3.cellArea(cell, h3.UNITS.km2) }
    })
    .sort((a, b) => b.along - a.along)
  const total = sorted.reduce((sum, entry) => sum + entry.area, 0)
  const out = []
  let covered = 0
  for (const entry of sorted) {
    if (covered >= fraction * total) break
    out.push(entry.cell)
    covered += entry.area
  }
  return out
}

/** The country moved `km` east, outline and centre together. */
const shifted = (q, km) => {
  const east = (lat, lon) => lon + km / (111.32 * Math.cos((lat * Math.PI) / 180))
  return {
    ...q,
    // Its own id, so nothing cached for the real country is used for it.
    outline: `${q.outline}-east-${km}`,
    centre: { lat: q.centre.lat, lon: east(q.centre.lat, q.centre.lon) },
    polygons: q.polygons.map((polygon) => polygon.map((ring) => ring.map(([lon, lat]) => [east(lat, lon), lat])))
  }
}

const disc = (centre, km, resolution) =>
  h3.gridDisk(h3.latLngToCell(centre.lat, centre.lon, resolution), Math.max(0, Math.round(km / spacing(resolution))))

/**
 * Brush strokes as the paint controller lays them (a stamp every quarter
 * brush along each stroke): rows across the country a brush apart, keeping
 * the brush centre inside, then extra passes over a band: none, once over the
 * middle third, or twice over the northern third.
 */
const brushed = (q, resolution, R, extra) => {
  const inside = new Set(regionCells(q, resolution))
  const layer = new PaintLayer(resolution)
  const brush = R / 6
  const lats = [...inside].map((cell) => h3.cellToLatLng(cell)[0])
  const lons = [...inside].map((cell) => h3.cellToLatLng(cell)[1])
  const [lat0, lat1] = [Math.min(...lats), Math.max(...lats)]
  const [lon0, lon1] = [Math.min(...lons), Math.max(...lons)]
  const row = (lat) => {
    const km = (lon1 - lon0) * 111.32 * Math.cos((lat * Math.PI) / 180)
    const count = Math.max(1, Math.round(km / (brush / 4)))
    for (let i = 0; i <= count; i++) {
      const lon = lon0 + ((lon1 - lon0) * i) / count
      if (inside.has(h3.latLngToCell(lat, lon, resolution))) layer.stamp({ lat, lon }, brush, 0.3)
    }
  }
  const step = brush / 111
  for (let lat = lat0; lat <= lat1; lat += step) row(lat)
  const third = (lat1 - lat0) / 3
  const band = (from, to) => {
    for (let lat = from; lat <= to; lat += step) row(lat)
  }
  if (extra === "middle") band(lat0 + third, lat1 - third)
  if (extra === "north") for (let i = 0; i < 2; i++) band(lat1 - third, lat1)
  return buildDistribution(layer.toCells(), 0.05)
}

const cases = (q) => {
  const resolution = resolutionForTolerance(q.tolerance)
  const cells = regionCells(q, resolution)
  const R = Math.sqrt(area(cells) / Math.PI)
  const moved = (km) => regionCells(shifted(q, km), resolution)
  const blobResolution = Math.max(0, resolution - 1)
  const neighbour = moved(2 * R)
  const hedge = (weight, other) =>
    coat([
      { cells, weight },
      { cells: other, weight: 1 - weight }
    ])
  // Solid on the country, `x` as dense over the rest of 4x its area.
  const fourfold = bloatTo(cells, 0.25)
  const inside = new Set(cells)
  const ring = fourfold.filter((cell) => !inside.has(cell))
  const washed = (density) =>
    coat([
      { cells, weight: area(cells) },
      { cells: ring, weight: density * area(ring) }
    ])
  const antipode = [
    ...new Set(
      cells.map((cell) => {
        const [lat, lon] = h3.cellToLatLng(cell)
        return h3.latLngToCell(-lat, lon > 0 ? lon - 180 : lon + 180, resolution)
      })
    )
  ]
  return [
    ["exact shape", even(cells)],
    ["bloated until about 28% is off", even(bloatTo(cells, 0.75))],
    ["bloated until about half is off", even(bloatTo(cells, 0.5))],
    ["west 75% only", even(portion(cells, 0.75, (_, lon) => -lon))],
    ["west half only", even(portion(cells, 0.5, (_, lon) => -lon))],
    ["circle a tenth of the area, centred", even(disc(q.centre, R * Math.sqrt(0.1), resolution))],
    ["50/50: the country and its shape 2R away", hedge(0.5, neighbour)],
    [
      "50/50: the country and half its shape 2R away, squeezed",
      hedge(
        0.5,
        portion(neighbour, 0.5, (_, lon) => lon)
      )
    ],
    ["50/50: the country and its shape 5000 km away", hedge(0.5, moved(5000))],
    ["80/20: the country and its shape 2R away", hedge(0.8, neighbour)],
    ["20/80: the country and its shape 2R away", hedge(0.2, neighbour)],
    ["its shape 2R away only", even(neighbour)],
    ["solid, with a 10% wash over 4x the area", washed(0.1)],
    ["solid, with a 25% wash over 4x the area", washed(0.25)],
    ["solid, with a 50% wash over 4x the area", washed(0.5)],
    ["4x the area evenly, centred", even(fourfold)],
    ["shape shifted 3.4R east", even(moved(3.4 * R))],
    ["shape shifted 6.5R east", even(moved(6.5 * R))],
    ["shape shifted 9.6R east", even(moved(9.6 * R))],
    ["shape at the antipode", even(antipode)],
    ["brushed once", brushed(q, resolution, R)],
    ["brushed, with a second pass through the middle", brushed(q, resolution, R, "middle")],
    ["brushed, with two more passes over the north", brushed(q, resolution, R, "north")],
    ["missing the southern third", even(portion(cells, 2 / 3, (lat) => lat))],
    ["shape shifted 0.25R east", even(moved(0.25 * R))],
    ["shape shifted 0.5R east", even(moved(0.5 * R))],
    ["shape shifted 1R east", even(moved(R))],
    ["circle of the same area, centred", even(disc(q.centre, R, resolution))],
    [
      "bright middle, half density at the edges",
      coat([{ cells, weight: 1 }], (cell) => {
        const [lat, lon] = h3.cellToLatLng(cell)
        const km = Math.hypot(lat - q.centre.lat, (lon - q.centre.lon) * Math.cos((lat * Math.PI) / 180)) * 111
        return Math.max(0.5, 1.5 - km / R)
      })
    ],
    [
      "big faint blob far away (8x the area)",
      even(disc(shifted(q, (Math.sqrt(8) + 1) * R + 3000).centre, Math.sqrt(8) * R, blobResolution))
    ],
    ["the whole world painted evenly", even(h3.getRes0Cells().flatMap((cell) => h3.cellToChildren(cell, 2)))]
  ]
}

// ---- run ----------------------------------------------------------------------

const started = performance.now()
const table = new Map() // case -> country -> score
let slowest = { ms: 0, what: "" }
for (const label of COUNTRIES) {
  const q = byLabel(label)
  for (const [name, painted] of cases(q)) {
    const t = performance.now()
    const { score } = scoreArea(painted, q)
    const ms = performance.now() - t
    if (ms > slowest.ms) slowest = { ms, what: `${label}, ${name}` }
    if (!table.has(name)) table.set(name, new Map())
    table.get(name).set(label, score)
  }
}

const pad = (text, width) => String(text).padEnd(width)
const num = (score) => String(Math.round(score)).padStart(5)
let misses = 0
const means = new Map([["pass", PASS_SCORE.score]])
console.log(`Synthetic paints: mean over ${COUNTRIES.length} countries, against the target range\n`)
for (const [name, low, high, only] of TARGETS) {
  const scores = [...table.get(name)].filter(([country]) => !only || only.includes(country)).map(([, score]) => score)
  if (scores.length === 0) continue
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length
  means.set(name, mean)
  const targeted = low !== undefined && low !== null
  const ok = !targeted || (mean >= low && mean <= high)
  if (!ok) misses++
  console.log(`${ok ? " " : "✗"} ${pad(name, 50)}${num(mean)}   ${targeted ? `[${low}–${high}]` : "no target yet"}`)
}
for (const [name] of ORDERS.flatMap(([, lower, higher]) => [[lower], [higher]])) {
  if (!means.has(name)) {
    const scores = [...table.get(name).values()]
    means.set(name, scores.reduce((sum, score) => sum + score, 0) / scores.length)
  }
}
console.log("\nOrderings\n")
for (const [what, lower, higher] of ORDERS) {
  const ok = means.get(lower) < means.get(higher)
  if (!ok) misses++
  console.log(`${ok ? " " : "✗"} ${pad(what, 50)}${num(means.get(lower))} < ${num(means.get(higher)).trim()}`)
}

if (DETAIL) {
  console.log(`\n${pad("", 52)}${COUNTRIES.map((country) => country.slice(0, 9).padStart(10)).join("")}`)
  for (const [name] of TARGETS) {
    const row = table.get(name)
    console.log(
      `  ${pad(name, 50)}${COUNTRIES.map((country) => (row.has(country) ? num(row.get(country)) : "  -").padStart(10)).join("")}`
    )
  }
}

console.log("\nReal wrong answers: neighbours should beat far countries of similar size\n")
let nearWins = 0
const nearScores = []
for (const [countryLabel, near, far] of NEIGHBOURS) {
  const q = byLabel(countryLabel)
  const resolution = resolutionForTolerance(q.tolerance)
  const score = (name) => scoreArea(even(regionCells(byLabel(name), resolution)), q).score
  const nearEntries = near.map((name) => [name, score(name)])
  const farEntries = far.map((name) => [name, score(name)])
  const win = Math.min(...nearEntries.map(([, value]) => value)) > Math.max(...farEntries.map(([, value]) => value))
  if (win) nearWins++
  nearScores.push(...nearEntries.map(([, value]) => value))
  const list = (entries) => entries.map(([name, value]) => `${name} ${Math.round(value)}`).join(", ")
  console.log(`${win ? " " : "✗"} ${pad(countryLabel, 16)} near: ${list(nearEntries)} | far: ${list(farEntries)}`)
}
if (nearWins < NEIGHBOURS.length) misses++

const exact = AREAS.map((q) => {
  const resolution = resolutionForTolerance(q.tolerance)
  const painted = even(regionCells(q, resolution))
  return { label: q.label, score: scoreArea(painted, q).score, fit: regionFit(painted, q) }
}).sort((a, b) => a.score - b.score)
const worst = exact[0]
console.log(
  `\nEvery country painted exactly: lowest ${worst.label} ${worst.score.toFixed(1)} (covered ${Math.round(worst.fit.coverage * 100)}%, on it ${Math.round(worst.fit.precision * 100)}%)`
)
if (worst.score < 985) misses++
console.log(
  `Neighbours beat far countries in ${nearWins}/${NEIGHBOURS.length}; neighbour scores ${Math.round(Math.min(...nearScores))}–${Math.round(Math.max(...nearScores))}`
)
console.log(
  `Slowest single score: ${slowest.ms.toFixed(0)} ms (${slowest.what}); total ${((performance.now() - started) / 1000).toFixed(1)} s`
)
console.log(`\n${misses === 0 ? "Everything within target." : `${misses} outside target (marked ✗).`}`)
process.exitCode = misses === 0 ? 0 : 1
