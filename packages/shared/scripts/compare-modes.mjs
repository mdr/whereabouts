// The same kinds of guess scored as a point question and as a whole-country
// question, to compare how the two rules treat near misses, vagueness and
// hedges (docs/country-scoring.md). Distances are in each question's own
// tolerance. The real places in section 5 are round Paris and France.
//
// Usage, from packages/shared:
//   node scripts/compare-modes.mjs                         Paris and France, Germany as the neighbour
//   node scripts/compare-modes.mjs berlin Germany Poland   a place id, a country, a neighbour
import { readFileSync } from "node:fs";
import * as h3 from "h3-js";
import { buildDistribution, scoreDistribution } from "../src/scoring.ts";
import { resolutionForTolerance } from "../src/paint.ts";
import { regionCells, regionFit, scoreRegionQuestion } from "../src/regions.ts";

const REGIONS = JSON.parse(readFileSync(new URL("../regions.json", import.meta.url), "utf8"));
const QUESTIONS = JSON.parse(readFileSync(new URL("../questions.json", import.meta.url), "utf8"));
const country = (label) => REGIONS.find((r) => r.label === label) ?? fail(label);
const place = (id) => QUESTIONS.find((q) => q.id === id) ?? fail(id);
function fail(x) {
  throw new Error(`not found: ${x}`);
}

const [pointId, countryLabel] = process.argv.slice(2).filter((a) => a !== "--");
const P = place(pointId ?? "paris");
const C = country(countryLabel ?? "France");
const res = Math.max(resolutionForTolerance(P.toleranceKm), resolutionForTolerance(C.toleranceKm));
const area = (cells) => cells.reduce((s, h) => s + h3.cellArea(h, h3.UNITS.km2), 0);
const spacing = h3.getHexagonEdgeLengthAvg(res, h3.UNITS.km) * Math.sqrt(3);
const cCells = regionCells(C, res);
const R = Math.sqrt(area(cCells) / Math.PI);
const r = P.toleranceKm;
const rc = C.toleranceKm;

/** Paint parts [{cells, weight}], each spread evenly by area. */
function coat(parts) {
  const byCell = new Map();
  for (const { cells, weight } of parts) {
    const a = area(cells);
    for (const h of cells) byCell.set(h, (byCell.get(h) ?? 0) + weight / a);
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
const mix = (...pairs) => coat(pairs.map(([cells, weight]) => ({ cells, weight })));

const east = (p, km) => ({ lat: p.lat, lon: p.lon + km / (111.32 * Math.cos((p.lat * Math.PI) / 180)) });
const disc = (centre, km) =>
  h3.gridDisk(h3.latLngToCell(centre.lat, centre.lon, res), Math.max(0, Math.round(km / spacing)));
const shiftedCountry = (q, km) =>
  regionCells(
    {
      ...q,
      outline: q.outline.map((p) => p.map((ring) => ring.map(([lon, lat]) => [east({ lat, lon }, km).lon, lat]))),
    },
    res,
  );
function grow(cells, km) {
  const set = new Set(cells);
  let frontier = cells.filter((h) => h3.gridDisk(h, 1).some((n) => !set.has(n)));
  for (let i = 0; i < Math.max(1, Math.round(km / spacing)); i++) {
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
const westPart = (cells, frac) => {
  const sorted = cells.map((h) => ({ h, lon: h3.cellToLatLng(h)[1] })).sort((a, b) => a.lon - b.lon);
  return sorted.slice(0, Math.round(sorted.length * frac)).map((x) => x.h);
};

const pointScore = (d) => scoreDistribution(d, P.answer, r).score;
const areaScore = (d) => {
  const s = scoreRegionQuestion(d, C);
  return { ...s, ...regionFit(d, C) };
};
const fmt = (v) => String(Math.round(v)).padStart(5);
const areaCols = (s) =>
  `${fmt(s.score)}  (shape ${fmt(s.shape)}, 0.55×near ${fmt(0.55 * s.nearness)}${s.score === s.shape ? "" : " *"})`;

console.log(
  `Point: ${P.label}, r = ${r} km.  Area: ${C.label}, r = ${rc} km, R = ${Math.round(R)} km.  Painting res ${res}.\n`,
);

console.log("1. Confident miss: a tight blob (point) / the exact shape (area), moved k tolerances east");
console.log("   k    point   area                                       (k in R for area)");
for (const k of [0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32]) {
  const p = pointScore(even(disc(east(P.answer, k * r), r / 2)));
  const a = areaScore(even(shiftedCountry(C, k * rc)));
  console.log(`${String(k).padStart(4)}  ${fmt(p)}   ${areaCols(a)}   ${((k * rc) / R).toFixed(2)}R`);
}

console.log(
  "\n2. Vagueness, centred on the answer: blob of radius s (point) / border pushed out s (area), s in tolerances",
);
for (const s of [0.5, 1, 2, 3, 4, 6, 8, 12, 16]) {
  const p = pointScore(even(disc(P.answer, s * r)));
  const a = areaScore(even(grow(cCells, s * rc)));
  console.log(`${String(s).padStart(4)}  ${fmt(p)}   ${areaCols(a)}   on-country ${Math.round(a.precision * 100)}%`);
}

console.log("\n3. Hedge: weight w on the answer, 1−w on the same guess D tolerances east");
console.log("        D:      2         4          8         far (5000 km)");
console.log("   w   point/area per D");
for (const w of [1, 0.75, 0.5, 0.25, 0]) {
  const cells = [];
  for (const D of [2, 4, 8, null]) {
    const pk = D === null ? 5000 : D * r;
    const ak = D === null ? 5000 : D * rc;
    const p = pointScore(
      mix(
        ...[
          [disc(P.answer, r / 2), w],
          [disc(east(P.answer, pk), r / 2), 1 - w],
        ].filter(([, x]) => x > 0),
      ),
    );
    const a = areaScore(
      mix(
        ...[
          [cCells, w],
          [shiftedCountry(C, ak), 1 - w],
        ].filter(([, x]) => x > 0),
      ),
    ).score;
    cells.push(`${fmt(p)}/${fmt(a)}`);
  }
  console.log(`${w.toFixed(2).padStart(5)}  ${cells.join("  ")}`);
}

console.log("\n4. Two wrong guesses either side, 50/50, D tolerances east and west (point / area)");
for (const D of [1, 2, 4, 8]) {
  const p = pointScore(mix([disc(east(P.answer, D * r), r / 2), 0.5], [disc(east(P.answer, -D * r), r / 2), 0.5]));
  const a = areaScore(mix([shiftedCountry(C, D * rc), 0.5], [shiftedCountry(C, -D * rc), 0.5]));
  console.log(`${String(D).padStart(4)}  ${fmt(p)}   ${areaCols(a)}`);
}

// Real places and countries.
const city = (lat, lon) => disc({ lat, lon }, r / 2);
const CITIES = {
  Paris: city(48.8566, 2.3522),
  Brussels: city(50.8503, 4.3517),
  Lyon: city(45.764, 4.8357),
  Marseille: city(43.2965, 5.3698),
  London: city(51.5072, -0.1276),
  Berlin: city(52.52, 13.405),
  Madrid: city(40.4168, -3.7038),
  Rome: city(41.9028, 12.4964),
  "New York": city(40.7128, -74.006),
};
const cc = (l) => regionCells(country(l), res);
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
      "Austria",
    ].flatMap(cc),
  ),
];

console.log(`\n5. Real paints, scored both ways (point = ${P.label}, area = ${C.label})`);
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
  ["France", even(cc("France"))],
  ["Belgium", even(cc("Belgium"))],
  ["Switzerland", even(cc("Switzerland"))],
  ["Germany", even(cc("Germany"))],
  ["Spain", even(cc("Spain"))],
  ["Italy", even(cc("Italy"))],
  ["United Kingdom", even(cc("United Kingdom"))],
  ["France + Germany 50/50", mix([cc("France"), 0.5], [cc("Germany"), 0.5])],
  ["France + Spain 50/50", mix([cc("France"), 0.5], [cc("Spain"), 0.5])],
  ["Germany + Spain 50/50", mix([cc("Germany"), 0.5], [cc("Spain"), 0.5])],
  [
    "France 70% + Germany/Spain/Italy 10% each",
    mix([cc("France"), 0.7], [cc("Germany"), 0.1], [cc("Spain"), 0.1], [cc("Italy"), 0.1]),
  ],
  [`west half of ${C.label}`, even(westPart(cCells, 0.5))],
  [`${C.label}, border out 1R`, even(grow(cCells, R))],
  [`circle of radius R at ${C.label}'s centre`, even(disc(C.answer, R))],
  [`circle of radius R/2 at ${C.label}'s centre`, even(disc(C.answer, R / 2))],
  ["Western Europe evenly", even(EU)],
  ["the world evenly", even(h3.getRes0Cells().flatMap((c) => h3.cellToChildren(c, 2)))],
];
console.log(`${"".padEnd(44)}point   area`);
for (const [name, d] of real) {
  const a = areaScore(d);
  console.log(
    `${name.padEnd(44)}${fmt(pointScore(d))}   ${areaCols(a)}  cov ${Math.round(a.coverage * 100)}% prec ${Math.round(a.precision * 100)}%`,
  );
}

console.log(`\n6. Does nearness of the wrong half of a hedge matter? (area, ${C.label})`);
const nb = process.argv[4] ?? "Germany";
const nbCells = cc(nb);
const farCopy = (cells, km) => {
  const out = new Set();
  for (const h of cells) {
    const [lat, lon] = h3.cellToLatLng(h);
    const p = east({ lat, lon }, km);
    out.add(h3.latLngToCell(p.lat, p.lon, res));
  }
  return [...out];
};
for (const [name, d] of [
  [`${C.label} + ${nb} 50/50`, mix([cCells, 0.5], [nbCells, 0.5])],
  [`${C.label} + ${nb}'s shape 5000 km east 50/50`, mix([cCells, 0.5], [farCopy(nbCells, 5000), 0.5])],
  [`${nb} alone`, even(nbCells)],
  [`${nb}'s shape 5000 km east alone`, even(farCopy(nbCells, 5000))],
])
  console.log(`${name.padEnd(52)}${areaCols(areaScore(d))}`);

console.log(`\n7. Covering part of ${C.label} evenly (area): a centred circle, or the western part`);
for (const c of [1, 0.8, 0.65, 0.5, 0.4, 1 / 3, 0.25, 0.1]) {
  const circ = even(disc(C.answer, R * Math.sqrt(c)));
  const west = even(westPart(cCells, c));
  const a = areaScore(circ),
    b = areaScore(west);
  console.log(`c=${c.toFixed(2)}  circle ${areaCols(a)} cov ${Math.round(a.coverage * 100)}%   west ${areaCols(b)}`);
}
