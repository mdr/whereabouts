// Calibration for "Paint the whole of …" scoring (docs/country-scoring.md).
// Scores synthetic paints and real wrong countries with the game's own rule
// (scoreRegionQuestion) and reports each against the target range it was
// tuned to, so a change to a constant in src/regions.ts can be judged.
//
// Usage, from packages/shared:
//   pnpm calibrate                      the summary over nine countries
//   pnpm calibrate -- --detail          also every country's own scores
//   pnpm calibrate -- Germany Chile     just these countries (Natural Earth names as labelled)
//
// Synthetic paints are built from the country's own outline at its painting
// resolution, spread evenly unless the case says otherwise, with the usual 5%
// world floor. Distances are in R, the country's equivalent radius.
import { readFileSync } from "node:fs";
import * as h3 from "h3-js";
import { PASS_SCORE, buildDistribution } from "../src/scoring.ts";
import { PaintLayer, resolutionForTolerance } from "../src/paint.ts";
import { regionCells, regionFit, scoreRegionQuestion } from "../src/regions.ts";

const REGIONS = JSON.parse(readFileSync(new URL("../regions.json", import.meta.url), "utf8"));
const byLabel = (label) => {
  const q = REGIONS.find((r) => r.label === label);
  if (!q) throw new Error(`no country labelled ${label}`);
  return q;
};

const args = process.argv.slice(2).filter((a) => a !== "--");
const DETAIL = args.includes("--detail");
const chosen = args.filter((a) => !a.startsWith("--"));
const COUNTRIES = chosen.length
  ? chosen
  : ["Germany", "Italy", "Chile", "Egypt", "Indonesia", "United Kingdom", "Brazil", "Australia", "South Africa"];

// Countries where a paint shrunk or centred on the middle makes sense (not thin or island chains).
const COMPACT = ["Germany", "Egypt", "Brazil", "South Africa", "Australia"];

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
  ["big faint blob far away (8x the area)"],
];

// [what should hold, lower case, higher case]: orderings the targets imply.
const ORDERS = [
  [
    "squeezing the wrong half costs a little",
    "50/50: the country and half its shape 2R away, squeezed",
    "50/50: the country and its shape 2R away",
  ],
  [
    "nearer wrong paint costs less",
    "50/50: the country and its shape 5000 km away",
    "50/50: the country and its shape 2R away",
  ],
  ["a pass beats a wild guess", "shape at the antipode", "pass"],
];

// Real wrong answers: [question, neighbours, far away and of broadly similar size].
const NEIGHBOURS = [
  ["Germany", ["Poland", "France"], ["Japan", "Iran"]],
  ["Brazil", ["Argentina", "Peru", "Colombia"], ["Australia", "Kazakhstan"]],
  ["Chile", ["Argentina", "Peru"], ["Norway", "Japan"]],
  ["Egypt", ["Libya", "Saudi Arabia"], ["Mongolia", "Iran"]],
  ["United Kingdom", ["Ireland", "France"], ["Japan", "Cuba"]],
  ["Spain", ["France"], ["Turkey", "Madagascar"]],
  ["Poland", ["Germany"], ["Finland", "Vietnam"]],
];

// ---- building paints --------------------------------------------------------

const area = (cells) => cells.reduce((s, h) => s + h3.cellArea(h, h3.UNITS.km2), 0);
const spacing = (res) => h3.getHexagonEdgeLengthAvg(res, h3.UNITS.km) * Math.sqrt(3);

/** Paint each part's cells evenly by area with `weight` of the painted mass; intensity(h) varies it. */
function coat(parts, intensity = () => 1) {
  const byCell = new Map();
  for (const { cells, weight } of parts) {
    const a = area(cells);
    for (const h of cells) byCell.set(h, (byCell.get(h) ?? 0) + (weight * intensity(h)) / a);
  }
  return buildDistribution(
    [...byCell].map(([h, density]) => {
      const [lat, lon] = h3.cellToLatLng(h);
      return { lat, lon, intensity: density, areaKm2: h3.cellArea(h, h3.UNITS.km2), h3: h };
    }),
    0.05,
  );
}
const even = (cells) => coat([{ cells, weight: 1 }]);

/** The cells plus every cell within `rings` rings of them. */
function growRings(cells, rings) {
  const set = new Set(cells);
  let frontier = cells.filter((h) => h3.gridDisk(h, 1).some((n) => !set.has(n)));
  for (let i = 0; i < rings; i++) {
    const next = [];
    for (const h of frontier)
      for (const n of h3.gridDisk(h, 1))
        if (!set.has(n)) {
          set.add(n);
          next.push(n);
        }
    frontier = next;
  }
  return [...set];
}

/** Grow outward until the country is `share` of the painted area. */
function bloatTo(cells, share) {
  const target = area(cells) / share;
  let out = cells;
  for (let i = 1; area(out) < target && i < 200; i++) out = growRings(cells, i);
  return out;
}

/** The share `frac` of the country's area furthest along `key`. */
function portion(cells, frac, key) {
  const sorted = cells
    .map((h) => {
      const [lat, lon] = h3.cellToLatLng(h);
      return { h, k: key(lat, lon), a: h3.cellArea(h, h3.UNITS.km2) };
    })
    .sort((x, y) => y.k - x.k);
  const total = sorted.reduce((t, x) => t + x.a, 0);
  const out = [];
  let acc = 0;
  for (const x of sorted) {
    if (acc >= frac * total) break;
    out.push(x.h);
    acc += x.a;
  }
  return out;
}

/** The country moved `km` east, outline and centre together. */
function shifted(q, km) {
  const east = (lat, lon) => lon + km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return {
    ...q,
    answer: { lat: q.answer.lat, lon: east(q.answer.lat, q.answer.lon) },
    outline: q.outline.map((p) => p.map((ring) => ring.map(([lon, lat]) => [east(lat, lon), lat]))),
  };
}

const disc = (centre, km, res) =>
  h3.gridDisk(h3.latLngToCell(centre.lat, centre.lon, res), Math.max(0, Math.round(km / spacing(res))));

/**
 * Brush strokes as the paint controller lays them (a stamp every quarter
 * brush along each stroke): rows across the country a brush apart, keeping
 * the brush centre inside, then extra passes over a band: none, once over the
 * middle third, or twice over the northern third.
 */
function brushed(q, res, R, extra) {
  const inside = new Set(regionCells(q, res));
  const layer = new PaintLayer(res);
  const brush = R / 6;
  const lats = [...inside].map((h) => h3.cellToLatLng(h)[0]);
  const lons = [...inside].map((h) => h3.cellToLatLng(h)[1]);
  const [lat0, lat1] = [Math.min(...lats), Math.max(...lats)];
  const [lon0, lon1] = [Math.min(...lons), Math.max(...lons)];
  const row = (lat) => {
    const km = (lon1 - lon0) * 111.32 * Math.cos((lat * Math.PI) / 180);
    const n = Math.max(1, Math.round(km / (brush / 4)));
    for (let i = 0; i <= n; i++) {
      const lon = lon0 + ((lon1 - lon0) * i) / n;
      if (inside.has(h3.latLngToCell(lat, lon, res))) layer.stamp({ lat, lon }, brush, 0.3);
    }
  };
  const step = brush / 111;
  for (let lat = lat0; lat <= lat1; lat += step) row(lat);
  const third = (lat1 - lat0) / 3;
  const band = (from, to) => {
    for (let lat = from; lat <= to; lat += step) row(lat);
  };
  if (extra === "middle") band(lat0 + third, lat1 - third);
  if (extra === "north") for (let i = 0; i < 2; i++) band(lat1 - third, lat1);
  return buildDistribution(layer.toCells(), 0.05);
}

function cases(q) {
  const res = resolutionForTolerance(q.toleranceKm);
  const cells = regionCells(q, res);
  const R = Math.sqrt(area(cells) / Math.PI);
  const moved = (km) => regionCells(shifted(q, km), res);
  const blobRes = Math.max(0, res - 1);
  const neighbour = moved(2 * R);
  const hedge = (w, other) =>
    coat([
      { cells, weight: w },
      { cells: other, weight: 1 - w },
    ]);
  // Solid on the country, `x` as dense over the rest of 4x its area.
  const fourfold = bloatTo(cells, 0.25);
  const inside = new Set(cells);
  const ring = fourfold.filter((h) => !inside.has(h));
  const washed = (x) =>
    coat([
      { cells, weight: area(cells) },
      { cells: ring, weight: x * area(ring) },
    ]);
  const antipode = [
    ...new Set(
      cells.map((h) => {
        const [lat, lon] = h3.cellToLatLng(h);
        return h3.latLngToCell(-lat, lon > 0 ? lon - 180 : lon + 180, res);
      }),
    ),
  ];
  return [
    ["exact shape", even(cells)],
    ["bloated until about 28% is off", even(bloatTo(cells, 0.75))],
    ["bloated until about half is off", even(bloatTo(cells, 0.5))],
    ["west 75% only", even(portion(cells, 0.75, (_, lon) => -lon))],
    ["west half only", even(portion(cells, 0.5, (_, lon) => -lon))],
    ["circle a tenth of the area, centred", even(disc(q.answer, R * Math.sqrt(0.1), res))],
    ["50/50: the country and its shape 2R away", hedge(0.5, neighbour)],
    [
      "50/50: the country and half its shape 2R away, squeezed",
      hedge(
        0.5,
        portion(neighbour, 0.5, (_, lon) => lon),
      ),
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
    ["brushed once", brushed(q, res, R)],
    ["brushed, with a second pass through the middle", brushed(q, res, R, "middle")],
    ["brushed, with two more passes over the north", brushed(q, res, R, "north")],
    ["missing the southern third", even(portion(cells, 2 / 3, (lat) => lat))],
    ["shape shifted 0.25R east", even(moved(0.25 * R))],
    ["shape shifted 0.5R east", even(moved(0.5 * R))],
    ["shape shifted 1R east", even(moved(R))],
    ["circle of the same area, centred", even(disc(q.answer, R, res))],
    [
      "bright middle, half density at the edges",
      coat([{ cells, weight: 1 }], (h) => {
        const [lat, lon] = h3.cellToLatLng(h);
        const km = Math.hypot(lat - q.answer.lat, (lon - q.answer.lon) * Math.cos((lat * Math.PI) / 180)) * 111;
        return Math.max(0.5, 1.5 - km / R);
      }),
    ],
    [
      "big faint blob far away (8x the area)",
      even(disc(shifted(q, (Math.sqrt(8) + 1) * R + 3000).answer, Math.sqrt(8) * R, blobRes)),
    ],
    ["the whole world painted evenly", even(h3.getRes0Cells().flatMap((c) => h3.cellToChildren(c, 2)))],
  ];
}

// ---- run ----------------------------------------------------------------------

const started = performance.now();
const table = new Map(); // case -> country -> score
let slowest = { ms: 0, what: "" };
for (const label of COUNTRIES) {
  const q = byLabel(label);
  for (const [name, dist] of cases(q)) {
    const t = performance.now();
    const { score } = scoreRegionQuestion(dist, q);
    const ms = performance.now() - t;
    if (ms > slowest.ms) slowest = { ms, what: `${label}, ${name}` };
    if (!table.has(name)) table.set(name, new Map());
    table.get(name).set(label, score);
  }
}

const pad = (s, n) => String(s).padEnd(n);
const num = (v) => String(Math.round(v)).padStart(5);
let misses = 0;
const means = new Map([["pass", PASS_SCORE.score]]);
console.log(`Synthetic paints: mean over ${COUNTRIES.length} countries, against the target range\n`);
for (const [name, lo, hi, only] of TARGETS) {
  const scores = [...table.get(name)].filter(([c]) => !only || only.includes(c)).map(([, s]) => s);
  if (scores.length === 0) continue;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  means.set(name, mean);
  const targeted = lo !== undefined && lo !== null;
  const ok = !targeted || (mean >= lo && mean <= hi);
  if (!ok) misses++;
  console.log(`${ok ? " " : "✗"} ${pad(name, 50)}${num(mean)}   ${targeted ? `[${lo}–${hi}]` : "no target yet"}`);
}
for (const [name] of ORDERS.flatMap(([, a, b]) => [[a], [b]])) {
  if (!means.has(name)) {
    const scores = [...table.get(name).values()];
    means.set(name, scores.reduce((a, b) => a + b, 0) / scores.length);
  }
}
console.log("\nOrderings\n");
for (const [what, lower, higher] of ORDERS) {
  const ok = means.get(lower) < means.get(higher);
  if (!ok) misses++;
  console.log(`${ok ? " " : "✗"} ${pad(what, 50)}${num(means.get(lower))} < ${num(means.get(higher)).trim()}`);
}

if (DETAIL) {
  console.log(`\n${pad("", 52)}${COUNTRIES.map((c) => c.slice(0, 9).padStart(10)).join("")}`);
  for (const [name] of TARGETS) {
    const row = table.get(name);
    console.log(
      `  ${pad(name, 50)}${COUNTRIES.map((c) => (row.has(c) ? num(row.get(c)) : "  -").padStart(10)).join("")}`,
    );
  }
}

console.log("\nReal wrong answers: neighbours should beat far countries of similar size\n");
let nearWins = 0;
const nearScores = [];
for (const [ql, near, far] of NEIGHBOURS) {
  const q = byLabel(ql);
  const res = resolutionForTolerance(q.toleranceKm);
  const score = (l) => scoreRegionQuestion(even(regionCells(byLabel(l), res)), q).score;
  const ns = near.map((l) => [l, score(l)]);
  const fs = far.map((l) => [l, score(l)]);
  const win = Math.min(...ns.map(([, s]) => s)) > Math.max(...fs.map(([, s]) => s));
  if (win) nearWins++;
  nearScores.push(...ns.map(([, s]) => s));
  const list = (xs) => xs.map(([l, s]) => `${l} ${Math.round(s)}`).join(", ");
  console.log(`${win ? " " : "✗"} ${pad(ql, 16)} near: ${list(ns)} | far: ${list(fs)}`);
}
if (nearWins < NEIGHBOURS.length) misses++;

const exact = REGIONS.map((q) => {
  const res = resolutionForTolerance(q.toleranceKm);
  const d = even(regionCells(q, res));
  return { label: q.label, score: scoreRegionQuestion(d, q).score, fit: regionFit(d, q) };
}).sort((a, b) => a.score - b.score);
const worst = exact[0];
console.log(
  `\nEvery country painted exactly: lowest ${worst.label} ${worst.score.toFixed(1)} (covered ${Math.round(worst.fit.coverage * 100)}%, on it ${Math.round(worst.fit.precision * 100)}%)`,
);
if (worst.score < 985) misses++;
console.log(
  `Neighbours beat far countries in ${nearWins}/${NEIGHBOURS.length}; neighbour scores ${Math.round(Math.min(...nearScores))}–${Math.round(Math.max(...nearScores))}`,
);
console.log(
  `Slowest single score: ${slowest.ms.toFixed(0)} ms (${slowest.what}); total ${((performance.now() - started) / 1000).toFixed(1)} s`,
);
console.log(`\n${misses === 0 ? "Everything within target." : `${misses} outside target (marked ✗).`}`);
process.exitCode = misses === 0 ? 0 : 1;
