// Re-scores a scoring case copied from the practice dev drawer (see
// src/scoring/scoring-case.ts): the score it was copied with beside today's, under
// every kernel, and where the paint is relative to the answer.
//
// Usage, from packages/shared:
//   node --experimental-transform-types scripts/score-case.mjs case.txt
//   pbpaste | node --experimental-transform-types scripts/score-case.mjs
import { readFileSync } from "node:fs"
import { greatCircleDistance } from "../src/geo.ts"
import { PaintLayer } from "../src/paint/paint.ts"
import { KERNELS, buildDistribution, scoreDistribution } from "../src/scoring/scoring.ts"
import { regionFit, scoreArea } from "../src/scoring/regions.ts"
import { areaOf, questionById } from "./catalogue.mjs"
import { CaseQuestionType, decodeCase } from "../src/scoring/scoring-case.ts"

const text = readFileSync(process.argv[2] ?? 0, "utf8")
const scoringCase = await decodeCase(text)
const caseQuestion = scoringCase.question
const layer = PaintLayer.fromRecord(scoringCase.res, scoringCase.cells)
const painted = buildDistribution(layer.toCells(), scoringCase.floor)
const fixed = (value, places = 1) => value.toFixed(places)

console.log(
  `${caseQuestion.type} ${caseQuestion.id}: ${caseQuestion.label}${caseQuestion.flag ? ` (flag ${caseQuestion.flag})` : ""}`
)
console.log(
  `answer ${caseQuestion.answer.lat}, ${caseQuestion.answer.lon}; tolerance ${caseQuestion.tolerance} km; floor ${scoringCase.floor}`
)
console.log(
  `paint: ${layer.size} cells, finest res ${scoringCase.res}, ${layer
    .resolutionCounts()
    .map(([resolution, count]) => `res ${resolution}: ${count}`)
    .join(", ")}`
)
console.log(`copied with: ${scoringCase.score} under ${scoringCase.kernel}`, scoringCase.parts)

if (caseQuestion.type === CaseQuestionType.REGION) {
  const question = questionById(caseQuestion.id)
  if (!question) throw new Error(`no question with id ${caseQuestion.id} in catalogue.json`)
  const region = areaOf(question)
  const rescored = scoreArea(painted, region)
  const fit = regionFit(painted, region)
  console.log(`now: ${fixed(rescored.score)} (shape ${fixed(rescored.shape)}, nearness ${fixed(rescored.nearness)})`)
  console.log(`coverage ${fixed(fit.coverage * 100)}%, precision ${fixed(fit.precision * 100)}%`)
} else {
  for (const kernel of KERNELS) {
    const rescored = scoreDistribution(painted, caseQuestion.answer, caseQuestion.tolerance, kernel)
    console.log(
      `now: ${fixed(rescored.score).padStart(7)} A=${fixed(rescored.A, 4)} B=${fixed(rescored.B, 4)}  ${kernel.id}${kernel.id === scoringCase.kernel ? " (copied with)" : ""}`
    )
  }
}

console.log("blobs, largest first:")
for (const blob of layer.blobs()) {
  const distance = greatCircleDistance(blob.centroid, caseQuestion.answer)
  console.log(
    `  ${fixed(blob.fraction * 100).padStart(5)}% of paint, ${String(blob.cells).padStart(5)} cells, centred ${fixed(blob.centroid.lat, 3)}, ${fixed(blob.centroid.lon, 3)}: ${fixed(distance)} km (${fixed(distance / caseQuestion.tolerance, 2)} tolerances) from the answer`
  )
}
