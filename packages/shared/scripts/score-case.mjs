// Re-scores a scoring case copied from the practice dev drawer (see
// src/scoring-case.ts): the score it was copied with beside today's, under
// every kernel, and where the paint is relative to the answer.
//
// Usage, from packages/shared:
//   node scripts/score-case.mjs case.txt
//   pbpaste | node scripts/score-case.mjs
import { readFileSync } from "node:fs";
import { greatCircleDistance } from "../src/geo.ts";
import { PaintLayer } from "../src/paint.ts";
import { KERNELS, buildDistribution, scoreDistribution } from "../src/scoring.ts";
import { regionFit, scoreRegionQuestion } from "../src/regions.ts";
import { decodeCase } from "../src/scoring-case.ts";

const text = readFileSync(process.argv[2] ?? 0, "utf8");
const c = await decodeCase(text);
const q = c.question;
const layer = PaintLayer.fromRecord(c.res, c.cells);
const dist = buildDistribution(layer.toCells(), c.floor);
const n = (x, places = 1) => x.toFixed(places);

console.log(`${q.kind} ${q.id}: ${q.label}${q.flag ? ` (flag ${q.flag})` : ""}`);
console.log(`answer ${q.answer.lat}, ${q.answer.lon}; tolerance ${q.toleranceKm} km; floor ${c.floor}`);
console.log(
  `paint: ${layer.size} cells, finest res ${c.res}, ${layer
    .resolutionCounts()
    .map(([r, k]) => `res ${r}: ${k}`)
    .join(", ")}`,
);
console.log(`copied with: ${c.score} under ${c.kernel}`, c.parts);

if (q.kind === "region") {
  const regions = JSON.parse(readFileSync(new URL("../regions.json", import.meta.url), "utf8"));
  const region = regions.find((r) => r.id === q.id);
  if (!region) throw new Error(`no country with id ${q.id} in regions.json`);
  const s = scoreRegionQuestion(dist, region);
  const fit = regionFit(dist, region);
  console.log(`now: ${n(s.score)} (shape ${n(s.shape)}, nearness ${n(s.nearness)})`);
  console.log(`coverage ${n(fit.coverage * 100)}%, precision ${n(fit.precision * 100)}%`);
} else {
  for (const k of KERNELS) {
    const s = scoreDistribution(dist, q.answer, q.toleranceKm, k);
    console.log(
      `now: ${n(s.score).padStart(7)} A=${n(s.A, 4)} B=${n(s.B, 4)}  ${k.id}${k.id === c.kernel ? " (copied with)" : ""}`,
    );
  }
}

console.log("blobs, largest first:");
for (const b of layer.blobs()) {
  const d = greatCircleDistance(b.centroid, q.answer);
  console.log(
    `  ${n(b.fraction * 100).padStart(5)}% of paint, ${String(b.cells).padStart(5)} cells, centred ${n(b.centroid.lat, 3)}, ${n(b.centroid.lon, 3)}: ${n(d)} km (${n(d / q.toleranceKm, 2)} tolerances) from the answer`,
  );
}
