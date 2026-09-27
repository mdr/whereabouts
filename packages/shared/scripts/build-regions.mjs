// Builds regions.json and flags.json from Natural Earth's 1:50m countries
// (public domain).
//
// Usage: node scripts/build-regions.mjs [path/to/ne_50m_admin_0_countries.geojson]
// Without a path it downloads the file from the Natural Earth repository.
//
// regions.json holds the answers for "Paint the whole of Germany": every
// sovereign country of at least POINT_BELOW_KM2 whose borders are not in
// dispute and which does not cross the antimeridian, as an outline. Each keeps
// its largest landmass and every island of at least MIN_PART_KM2 within
// CHAIN_KM of what is already kept (so Sicily and Crete stay, the Canaries,
// Svalbard and Alaska go). The tolerance is a fifth of the country's
// equivalent radius, sqrt(area / pi): the scale the region kernel was
// calibrated at. Outlines are simplified to about SIMPLIFY_DEG
// (Douglas-Peucker), far finer than any tolerance, and rounded to match.
//
// flags.json holds the flag rounds, one per country: those in regions.json
// are painted whole (regionId), the rest are asked as a point, with a
// tolerance from their size (pointToleranceKm).
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
import { readFileSync, writeFileSync } from "node:fs";
import { cellArea, cellToLatLng, polygonToCells, UNITS } from "h3-js";

const NE_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";
const MIN_PART_KM2 = 1500;
const CHAIN_KM = 500;
const TOLERANCE_FRACTION = 0.2;
const SIMPLIFY_DEG = 0.015;
/** Countries smaller than this are asked as a point: too small to paint the shape of. */
const POINT_BELOW_KM2 = 10_000;
/**
 * Countries whose kept parts hold less than this share of their land are
 * asked as a point too: scattered archipelagos (the Bahamas, Vanuatu), whose
 * outline would leave out many of the islands a player paints.
 */
const MIN_KEPT_SHARE = 0.75;
/** Wider island chaining for a country in two halves: East Malaysia is 600 km from the peninsula. */
const CHAIN_KM_FOR = { Malaysia: 800 };

// Not UN members, and each wholly inside a disputed area: left out.
const LEFT_OUT = new Set(["Northern Cyprus", "Somaliland", "Taiwan", "Kosovo"]);

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
  "Cyprus", // Northern Cyprus
]);

// Overrides by Natural Earth ADMIN name. label: shown after the reveal
// (default NAME_EN); the: prompts say "the Netherlands"; wiki: English
// Wikipedia title (default the label); id: kept from before flags.
const NAMES = {
  "United Kingdom": { the: true, id: "uk-region" },
  "Democratic Republic of the Congo": { the: true, id: "drc-region" },
  "Republic of the Congo": { the: true },
  "United States of America": { label: "United States", the: true, wiki: "United States" },
  Ireland: { wiki: "Republic of Ireland" },
  Georgia: { wiki: "Georgia (country)" },
  China: { label: "China", wiki: "China" },
  Vatican: { label: "Vatican City", wiki: "Vatican City" },
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
};

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

/** A ring's area on the sphere, km² (the spherical excess, as in d3-geo). */
function ringAreaKm2(ring) {
  const r = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    sum += (lon2 - lon1) * r * (2 + Math.sin(lat1 * r) + Math.sin(lat2 * r));
  }
  return Math.abs((sum * R * R) / 2);
}

/** Whether [lon, lat] is inside a ring (ray casting, in degrees: fine at island scale). */
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const onLand = (pt, polygons) =>
  polygons.some(([outer, ...holes]) => inRing(pt, outer) && !holes.some((h) => inRing(pt, h)));

/**
 * Where a small country is asked: its label point, unless that is out at sea
 * (São Tomé and Príncipe's lies between its two islands, 70 km from each),
 * then the middle of its largest island. Within LABEL_SLACK_KM of the land
 * counts as on it: the 1:50m outline of Vatican City misses its label point.
 */
const LABEL_SLACK_KM = 5;
function islandAnswer(p, polygons) {
  const label = { lat: round4(p.LABEL_Y), lon: round4(p.LABEL_X) };
  const pt = [label.lon, label.lat];
  const near = polygons.some((poly) => poly[0].some((v) => km(pt, v) <= LABEL_SLACK_KM));
  if (near || onLand(pt, polygons)) return label;
  const largest = polygons.reduce((a, b) => (polygonAreaKm2(b) > polygonAreaKm2(a) ? b : a));
  const cells = cellsOf(largest, 9);
  const middle = cells.length > 0 ? centroid(cells) : null;
  if (middle && onLand([middle.lon, middle.lat], [largest])) return middle;
  const [lon, lat] = largest[0][0];
  return { lat: round4(lat), lon: round4(lon) };
}

/** A polygon's area, km²: its outer ring less its holes. */
const polygonAreaKm2 = ([outer, ...holes]) => ringAreaKm2(outer) - holes.reduce((s, h) => s + ringAreaKm2(h), 0);

const polygonsOf = (geometry) => (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates);

function keptParts(geometry, chainKm = CHAIN_KM) {
  const parts = polygonsOf(geometry)
    .map((polygon) => ({ polygon, area: areaOf(cellsOf(polygon, 6)) }))
    .filter((p) => p.area >= MIN_PART_KM2)
    .sort((a, b) => b.area - a.area);
  const kept = [parts.shift()];
  // Grow the set: an island joins if it is near any part already kept.
  for (let grew = true; grew;) {
    grew = false;
    for (let i = 0; i < parts.length; i++) {
      if (kept.some((k) => gapKm(k.polygon, parts[i].polygon) <= chainKm)) {
        kept.push(...parts.splice(i, 1));
        grew = true;
        i--;
      }
    }
  }
  return kept.map((p) => p.polygon);
}

/**
 * Whether the parts reach the antimeridian from both sides. Natural Earth
 * splits polygons there, so each part is fine on its own, but the country's
 * outline and framing are not: such countries are asked as a point.
 */
function crossesAntimeridian(polygons) {
  const lons = polygons.flatMap((p) => p[0].map(([lon]) => lon));
  return Math.max(...lons) > 179.5 && Math.min(...lons) < -179.5;
}

const round4 = (v) => Math.round(v * 1e4) / 1e4;

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
  return {
    lat: round4((Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI),
    lon: round4((Math.atan2(y, x) * 180) / Math.PI),
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
const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * The tolerance of a country asked as a point, km: POINT_TOLERANCE_FRACTION
 * of its equivalent radius, and at least MIN_POINT_TOLERANCE_KM. A small or
 * scattered country's islands can lie far apart (Kiribati, the Bahamas), so
 * for those it is at least SPREAD_FRACTION of its spread: the greatest distance from the
 * answer to any of its land. Rounded to 5 km. At half the radius, painting
 * the country evenly scores about 890, a tight blob at its centre about 990,
 * and a neighbour's area two radii away about 640.
 */
const POINT_TOLERANCE_FRACTION = 0.5;
const SPREAD_FRACTION = 0.25;
const MIN_POINT_TOLERANCE_KM = 15;
function pointToleranceKm(areaKm2, spreadKm, islands) {
  const t = Math.max(POINT_TOLERANCE_FRACTION * Math.sqrt(areaKm2 / Math.PI), islands ? SPREAD_FRACTION * spreadKm : 0);
  return Math.max(MIN_POINT_TOLERANCE_KM, Math.round(t / 5) * 5);
}

const BORDER_SIMPLIFY_DEG = 0.05;
const BORDER_MIN_KM2 = 50;
/**
 * Parts of a country that the reveal names no country for, rather than take
 * a side (a polygon wholly inside one of these boxes, [west, south, east,
 * north]): Crimea, drawn with Russia in Natural Earth.
 */
const BORDER_LEFT_OUT = { Russia: [[32, 44, 37, 46.5]] };
/**
 * Natural Earth's Morocco includes the part of Western Sahara it controls:
 * everything south of the border, 27°40′N, names no country either.
 */
const BORDER_NONE_SOUTH_OF = { Morocco: 27 + 40 / 60 };

/** A ring clipped to the part south of a parallel (Sutherland-Hodgman against one edge). */
function southOf(ring, lat0) {
  const out = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const [a, b] = [ring[i], ring[i + 1]];
    if (a[1] <= lat0) out.push(a);
    if (a[1] <= lat0 !== b[1] <= lat0) {
      const t = (lat0 - a[1]) / (b[1] - a[1]);
      out.push([a[0] + t * (b[0] - a[0]), lat0]);
    }
  }
  return out.length >= 3 ? [...out, out[0]] : null;
}
const inBoxes = (admin) => (poly) =>
  (BORDER_LEFT_OUT[admin] ?? []).some(([w, s, e, n]) =>
    poly[0].every(([lon, lat]) => lon >= w && lon <= e && lat >= s && lat <= n),
  );

/** Polygons' rings for borders.json, delta-encoded in hundredths of a degree. */
function borderRings(polygons) {
  return polygons
    .filter((poly) => ringAreaKm2(poly[0]) >= BORDER_MIN_KM2)
    .flatMap((poly) => poly.map((ring) => simplifyRing(ring, BORDER_SIMPLIFY_DEG)).filter(Boolean))
    .map((ring) => {
      let x = 0,
        y = 0;
      return ring.flatMap(([lon, lat]) => {
        const [X, Y] = [Math.round(lon * 100), Math.round(lat * 100)];
        const step = [X - x, Y - y];
        [x, y] = [X, Y];
        return step;
      });
    });
}

const ne = JSON.parse(process.argv[2] ? readFileSync(process.argv[2], "utf8") : await (await fetch(NE_URL)).text());
const countries = ne.features.filter((f) => {
  const p = f.properties;
  return (
    ["Sovereign country", "Country", "Sovereignty", "Disputed"].includes(p.TYPE) &&
    p.ADMIN === p.SOVEREIGNT &&
    !LEFT_OUT.has(p.ADMIN)
  );
});

const regions = [];
const flags = [];
const borders = [];
const none = borderRings(
  ne.features
    .filter((f) => f.properties.TYPE === "Indeterminate" && f.properties.ADMIN !== "Antarctica")
    .flatMap((f) => polygonsOf(f.geometry)),
);
for (const feature of countries.sort((a, b) => a.properties.ADMIN.localeCompare(b.properties.ADMIN))) {
  const p = feature.properties;
  const names = NAMES[p.ADMIN] ?? {};
  const label = names.label ?? p.NAME_EN;
  const name = names.the ? `the ${label.replace(/^The /, "")}` : label;
  const wiki = names.wiki ?? label;
  const flag = p.ISO_A2_EH.toLowerCase();
  if (!/^[a-z]{2}$/.test(flag)) throw new Error(`no ISO code for ${p.ADMIN}`);
  const all = polygonsOf(feature.geometry);
  const area = all.reduce((s, poly) => s + polygonAreaKm2(poly), 0);
  none.push(...borderRings(all.filter(inBoxes(p.ADMIN))));
  const south = BORDER_NONE_SOUTH_OF[p.ADMIN];
  if (south !== undefined)
    none.push(...borderRings(all.map((poly) => [southOf(poly[0], south)]).filter(([ring]) => ring !== null)));
  const border = { flag, rings: borderRings(all.filter((poly) => !inBoxes(p.ADMIN)(poly))) };
  borders.push(border);
  const kept = area >= POINT_BELOW_KM2 ? keptParts(feature.geometry, CHAIN_KM_FOR[p.ADMIN]) : null;
  const keptShare = kept ? kept.reduce((s, poly) => s + polygonAreaKm2(poly), 0) / area : 0;
  const why =
    area < POINT_BELOW_KM2
      ? "small"
      : DISPUTED.has(p.ADMIN)
        ? "disputed"
        : crossesAntimeridian(kept)
          ? "antimeridian"
          : keptShare < MIN_KEPT_SHARE
            ? "scattered"
            : p.ADMIN === "United States of America"
              ? "far-flung" // Alaska and Hawaii; the outline below keeps the contiguous states
              : null;

  if (!why || why === "far-flung") {
    const cells = kept.flatMap((poly) => cellsOf(poly, 6));
    const keptArea = areaOf(cells);
    const toleranceKm = Math.max(5, Math.round((TOLERANCE_FRACTION * Math.sqrt(keptArea / Math.PI)) / 5) * 5);
    const contiguous = p.ADMIN === "United States of America";
    const regionLabel = contiguous ? "Contiguous United States" : label;
    regions.push({
      id: names.id ?? (contiguous ? "usa-region" : `${slug(label)}-region`),
      kind: "region",
      prompt: `Paint the whole of ${contiguous ? "the contiguous United States" : name}`,
      label: regionLabel,
      wiki: contiguous ? "Contiguous United States" : wiki,
      answer: centroid(cells),
      toleranceKm,
      outline: kept
        .map((poly) => poly.map((ring) => simplifyRing(ring, SIMPLIFY_DEG)).filter(Boolean))
        .filter((poly) => poly.length > 0),
    });
  }

  if (!why) {
    const region = regions.at(-1);
    flags.push({
      id: `flag-${flag}`,
      flag,
      label,
      wiki,
      answer: region.answer,
      toleranceKm: region.toleranceKm,
      regionId: region.id,
    });
    console.log(
      `${label}: painted, ${kept.length} part(s), ${Math.round(100 * keptShare)}% of its land, tolerance ${region.toleranceKm} km`,
    );
  } else {
    // Small and scattered countries are asked on land near their label
    // point (a centroid could fall in the sea between islands); larger ones
    // at their centre.
    const island = why === "small" || why === "scattered";
    const answer = island ? islandAnswer(p, all) : centroid(all.flatMap((poly) => cellsOf(poly, 4)));
    const spread = Math.max(...all.flatMap((poly) => poly[0].map((pt) => km([answer.lon, answer.lat], pt))));
    const toleranceKm = pointToleranceKm(area, spread, island);
    flags.push({ id: `flag-${flag}`, flag, label, wiki, answer, toleranceKm });
    if (island) border.near = toleranceKm;
    console.log(
      `${label}: point (${why}), ${Math.round(area)} km², spread ${Math.round(spread)} km, tolerance ${toleranceKm} km`,
    );
  }
}

const write = (file, data) => {
  writeFileSync(new URL(`../${file}`, import.meta.url), JSON.stringify(data) + "\n");
  console.log(
    `wrote ${data.length ?? data.countries.length} to ${file}, ${Math.round(JSON.stringify(data).length / 1024)} KB`,
  );
};
write("regions.json", regions);
write("flags.json", flags);
write("borders.json", { countries: borders, none });
