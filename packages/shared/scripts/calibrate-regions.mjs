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
import { buildDistribution } from "../src/scoring.ts";
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

// [case, low, high, only for these countries?, accepted?]: the judgement
// targets from playtesting. A case marked accepted falls outside its range
// under the current rule by a trade-off made on purpose (see the doc); it is
// shown but not counted as a miss.
const SLIGHTLY_OFF = "no kernel blurs the border now (decision 5)";
const NEAR_FLOOR = "the nearness safety net lifts misses near the country (decision 5)";
const TARGETS = [
  ["exact shape", 985, 1000],
  ["border 0.1R outward", 870, 960, null, SLIGHTLY_OFF],
  ["border 0.25R outward", 750, 880, null, SLIGHTLY_OFF],
  ["bloated until about half is off", 700, 790],
  ["west 65% only", 620, 760],
  ["west half only", 450, 620],
  ["missing the southern third", 620, 780],
  ["shape shifted 0.25R east", 780, 920, null, SLIGHTLY_OFF],
  ["shape shifted 0.5R east", 500, 720],
  ["shape shifted 1R east", 200, 450, null, NEAR_FLOOR],
  ["shape shifted 2R east", 30, 300, null, NEAR_FLOOR],
  ["shape shifted 5000 km east", 0, 120, null, `${NEAR_FLOOR}; 5000 km is about 3R for Australia`],
  ["circle of the same area, centred", 780, 950, COMPACT],
  ["vague: border 1R outward", 480, 700],
  ["bright middle, half density at the edges", 850, 980],
  ["brushed, with a second pass through the middle", 850, 980],
  ["50/50: the country and its shape 2R away", 650, 800],
  ["big faint blob far away (8x the area)", 230, 320],
  ["the whole world painted evenly", 250, 350],
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
const grow = (cells, km, res) => growRings(cells, Math.max(1, Math.round(km / spacing(res))));

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
 * the brush centre inside, then a second pass over the middle third.
 */
function brushed(q, res, R) {
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
  for (let lat = lat0 + third; lat <= lat1 - third; lat += step) row(lat);
  return buildDistribution(layer.toCells(), 0.05);
}

function cases(q) {
  const res = resolutionForTolerance(q.toleranceKm);
  const cells = regionCells(q, res);
  const R = Math.sqrt(area(cells) / Math.PI);
  const moved = (km) => regionCells(shifted(q, km), res);
  const blobRes = Math.max(0, res - 1);
  return [
    ["exact shape", even(cells)],
    ["border 0.1R outward", even(grow(cells, 0.1 * R, res))],
    ["border 0.25R outward", even(grow(cells, 0.25 * R, res))],
    ["bloated until about half is off", even(bloatTo(cells, 0.53))],
    ["west 65% only", even(portion(cells, 0.65, (_, lon) => -lon))],
    ["west half only", even(portion(cells, 0.5, (_, lon) => -lon))],
    ["missing the southern third", even(portion(cells, 2 / 3, (lat) => lat))],
    ["shape shifted 0.25R east", even(moved(0.25 * R))],
    ["shape shifted 0.5R east", even(moved(0.5 * R))],
    ["shape shifted 1R east", even(moved(R))],
    ["shape shifted 2R east", even(moved(2 * R))],
    ["shape shifted 5000 km east", even(moved(5000))],
    ["circle of the same area, centred", even(disc(q.answer, R, res))],
    ["vague: border 1R outward", even(grow(cells, R, res))],
    [
      "bright middle, half density at the edges",
      coat([{ cells, weight: 1 }], (h) => {
        const [lat, lon] = h3.cellToLatLng(h);
        const km = Math.hypot(lat - q.answer.lat, (lon - q.answer.lon) * Math.cos((lat * Math.PI) / 180)) * 111;
        return Math.max(0.5, 1.5 - km / R);
      }),
    ],
    ["brushed, with a second pass through the middle", brushed(q, res, R)],
    [
      "50/50: the country and its shape 2R away",
      coat([
        { cells, weight: 0.5 },
        { cells: moved(2 * R), weight: 0.5 },
      ]),
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
let accepted = 0;
console.log(`Synthetic paints: mean over ${COUNTRIES.length} countries, against the target range\n`);
for (const [name, lo, hi, only, why] of TARGETS) {
  const scores = [...table.get(name)].filter(([c]) => !only || only.includes(c)).map(([, s]) => s);
  if (scores.length === 0) continue;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const ok = mean >= lo && mean <= hi;
  const mark = ok ? " " : why ? "~" : "✗";
  if (!ok && why) accepted++;
  else if (!ok) misses++;
  console.log(`${mark} ${pad(name, 50)}${num(mean)}   [${lo}–${hi}]${!ok && why ? `  accepted: ${why}` : ""}`);
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
console.log(
  `\n${misses === 0 ? "Nothing unexpected outside target." : `${misses} outside target (marked ✗).`}` +
    (accepted ? ` ${accepted} accepted trade-off${accepted === 1 ? "" : "s"} (marked ~).` : ""),
);
process.exitCode = misses === 0 ? 0 : 1;
