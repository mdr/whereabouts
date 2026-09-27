// Builds regions.json, the answers for "Paint the whole of Germany" questions,
// from Natural Earth's 1:50m countries (public domain).
//
// Usage: node scripts/build-regions.mjs [path/to/ne_50m_admin_0_countries.geojson]
// Without a path it downloads the file from the Natural Earth repository.
//
// Each country keeps its largest landmass and every island of at least
// MIN_PART_KM2 within CHAIN_KM of what is already kept (so Sicily and Crete
// stay, the Canaries, Svalbard and Alaska go). The tolerance is a fifth of
// the country's equivalent radius, sqrt(area / pi): the scale the region
// kernel was calibrated at. Outlines are simplified to about SIMPLIFY_DEG
// (Douglas-Peucker), far finer than any tolerance, and rounded to match.
import { readFileSync, writeFileSync } from "node:fs";
import { cellArea, cellToLatLng, polygonToCells, UNITS } from "h3-js";

const NE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";
const MIN_PART_KM2 = 1500;
const CHAIN_KM = 500;
const TOLERANCE_FRACTION = 0.2;
const SIMPLIFY_DEG = 0.015;

// [Natural Earth ADMIN name, id, label, prompt name, Wikipedia title]. Left out
// for now: countries with disputed borders, and those crossing the antimeridian.
const COUNTRIES = [
  ["Germany", "germany-region", "Germany", "Germany", "Germany"],
  ["France", "france-region", "France", "France", "France"],
  ["Spain", "spain-region", "Spain", "Spain", "Spain"],
  ["Italy", "italy-region", "Italy", "Italy", "Italy"],
  ["United Kingdom", "uk-region", "United Kingdom", "the United Kingdom", "United Kingdom"],
  ["Ireland", "ireland-region", "Ireland", "Ireland", "Republic of Ireland"],
  ["Poland", "poland-region", "Poland", "Poland", "Poland"],
  ["Norway", "norway-region", "Norway", "Norway", "Norway"],
  ["Sweden", "sweden-region", "Sweden", "Sweden", "Sweden"],
  ["Finland", "finland-region", "Finland", "Finland", "Finland"],
  ["Greece", "greece-region", "Greece", "Greece", "Greece"],
  ["Turkey", "turkey-region", "Turkey", "Turkey", "Turkey"],
  ["Egypt", "egypt-region", "Egypt", "Egypt", "Egypt"],
  ["Algeria", "algeria-region", "Algeria", "Algeria", "Algeria"],
  ["Libya", "libya-region", "Libya", "Libya", "Libya"],
  ["Nigeria", "nigeria-region", "Nigeria", "Nigeria", "Nigeria"],
  [
    "Democratic Republic of the Congo",
    "drc-region",
    "Democratic Republic of the Congo",
    "the Democratic Republic of the Congo",
    "Democratic Republic of the Congo",
  ],
  ["South Africa", "south-africa-region", "South Africa", "South Africa", "South Africa"],
  ["Madagascar", "madagascar-region", "Madagascar", "Madagascar", "Madagascar"],
  ["Saudi Arabia", "saudi-arabia-region", "Saudi Arabia", "Saudi Arabia", "Saudi Arabia"],
  ["Iran", "iran-region", "Iran", "Iran", "Iran"],
  ["Kazakhstan", "kazakhstan-region", "Kazakhstan", "Kazakhstan", "Kazakhstan"],
  ["Mongolia", "mongolia-region", "Mongolia", "Mongolia", "Mongolia"],
  ["Japan", "japan-region", "Japan", "Japan", "Japan"],
  ["Thailand", "thailand-region", "Thailand", "Thailand", "Thailand"],
  ["Vietnam", "vietnam-region", "Vietnam", "Vietnam", "Vietnam"],
  ["Philippines", "philippines-region", "Philippines", "the Philippines", "Philippines"],
  ["Indonesia", "indonesia-region", "Indonesia", "Indonesia", "Indonesia"],
  ["Australia", "australia-region", "Australia", "Australia", "Australia"],
  [
    "United States of America",
    "usa-region",
    "Contiguous United States",
    "the contiguous United States",
    "Contiguous United States",
  ],
  ["Mexico", "mexico-region", "Mexico", "Mexico", "Mexico"],
  ["Cuba", "cuba-region", "Cuba", "Cuba", "Cuba"],
  ["Colombia", "colombia-region", "Colombia", "Colombia", "Colombia"],
  ["Peru", "peru-region", "Peru", "Peru", "Peru"],
  ["Brazil", "brazil-region", "Brazil", "Brazil", "Brazil"],
  ["Chile", "chile-region", "Chile", "Chile", "Chile"],
  ["Argentina", "argentina-region", "Argentina", "Argentina", "Argentina"],
];

const R = 6371;
function km([lon1, lat1], [lon2, lat2]) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Closest approach between two polygons' outer rings, by vertices. */
function gapKm(a, b) {
  let best = Infinity;
  for (const p of a[0]) for (const q of b[0]) best = Math.min(best, km(p, q));
  return best;
}

const cellsOf = (polygon, res) => polygonToCells(polygon, res, true);
const areaOf = (cells) => cells.reduce((s, h) => s + cellArea(h, UNITS.km2), 0);

function keptParts(geometry) {
  const parts = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates)
    .map((polygon) => ({ polygon, area: areaOf(cellsOf(polygon, 6)) }))
    .filter((p) => p.area >= MIN_PART_KM2)
    .sort((a, b) => b.area - a.area);
  const kept = [parts.shift()];
  // Grow the set: an island joins if it is near any part already kept.
  for (let grew = true; grew;) {
    grew = false;
    for (let i = 0; i < parts.length; i++) {
      if (kept.some((k) => gapKm(k.polygon, parts[i].polygon) <= CHAIN_KM)) {
        kept.push(...parts.splice(i, 1));
        grew = true;
        i--;
      }
    }
  }
  return kept.map((p) => p.polygon);
}

function centroid(cells) {
  let x = 0,
    y = 0,
    z = 0;
  for (const h of cells) {
    const [lat, lon] = cellToLatLng(h);
    const a = cellArea(h, UNITS.km2);
    const la = (lat * Math.PI) / 180,
      lo = (lon * Math.PI) / 180;
    x += a * Math.cos(la) * Math.cos(lo);
    y += a * Math.cos(la) * Math.sin(lo);
    z += a * Math.sin(la);
  }
  const round = (v) => Math.round(v * 1e4) / 1e4;
  return {
    lat: round((Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI),
    lon: round((Math.atan2(y, x) * 180) / Math.PI),
  };
}

/** Douglas-Peucker on a closed ring, in degrees (longitude scaled by cos(lat)). */
function simplifyRing(ring, eps) {
  const cos = Math.cos((ring[0][1] * Math.PI) / 180);
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = [ring[a][0] * cos, ring[a][1]];
    const [bx, by] = [ring[b][0] * cos, ring[b][1]];
    const len = Math.hypot(bx - ax, by - ay);
    let worst = -1,
      at = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = [ring[i][0] * cos, ring[i][1]];
      const d =
        len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > eps) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  const out = ring.filter((_, i) => keep[i]).map(([lon, lat]) => [round2(lon), round2(lat)]);
  // Rounding can repeat a point; a ring needs four positions to stay a polygon.
  const dedup = out.filter((pt, i) => i === 0 || pt[0] !== out[i - 1][0] || pt[1] !== out[i - 1][1]);
  return dedup.length >= 4 ? dedup : null;
}

const round2 = (v) => Math.round(v * 100) / 100;

const ne = JSON.parse(process.argv[2] ? readFileSync(process.argv[2], "utf8") : await (await fetch(NE_URL)).text());
const out = [];
for (const [admin, id, label, name, wiki] of COUNTRIES) {
  const feature = ne.features.find((f) => f.properties.ADMIN === admin);
  if (!feature) throw new Error(`not in Natural Earth: ${admin}`);
  const polygons = keptParts(feature.geometry);
  for (const p of polygons) {
    const lons = p[0].map(([lon]) => lon);
    if (Math.max(...lons) - Math.min(...lons) > 180) throw new Error(`${admin} crosses the antimeridian`);
  }
  const cells = polygons.flatMap((p) => cellsOf(p, 6));
  const area = areaOf(cells);
  const toleranceKm = Math.max(5, Math.round((TOLERANCE_FRACTION * Math.sqrt(area / Math.PI)) / 5) * 5);
  out.push({
    id,
    kind: "region",
    prompt: `Paint the whole of ${name}`,
    label,
    wiki,
    answer: centroid(cells),
    toleranceKm,
    outline: polygons
      .map((p) => p.map((ring) => simplifyRing(ring, SIMPLIFY_DEG)).filter(Boolean))
      .filter((p) => p.length > 0),
  });
  console.log(
    `${label}: ${polygons.length} part(s) of ${feature.geometry.type === "Polygon" ? 1 : feature.geometry.coordinates.length}, ${Math.round(area / 1000)}k km², tolerance ${toleranceKm} km`,
  );
}
const path = new URL("../regions.json", import.meta.url);
writeFileSync(path, JSON.stringify(out) + "\n");
console.log(`wrote ${out.length} regions, ${Math.round(JSON.stringify(out).length / 1024)} KB`);
