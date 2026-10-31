// How the build scripts write their questions: each replaces the catalogue's
// questions of its own types, keeping the rest, and the outlines follow, so
// outlines.json holds exactly those the catalogue's area answers use.
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

const ORDER = ["LANDMARK", "PLACE", "COUNTRY", "FLAG", "FEATURE", "STATE"]
const file = (name) => new URL(`../${name}`, import.meta.url)

/** Write `questions` as the catalogue's questions of `types`, with the outlines they bring by id. */
export function writeQuestions(types, questions, outlines) {
  const kept = JSON.parse(readFileSync(file("catalogue.json"), "utf8")).filter((q) => !types.includes(q.type))
  const catalogue = [...kept, ...questions].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
  const all = { ...JSON.parse(readFileSync(file("outlines.json"), "utf8")), ...outlines }
  const used = {}
  for (const q of catalogue) {
    if (q.answer.type !== "AREA") continue
    const outline = all[q.answer.outline]
    if (!outline) throw new Error(`${q.id}: no outline ${q.answer.outline}`)
    used[q.answer.outline] = outline
  }
  writeFileSync(file("catalogue.json"), JSON.stringify(catalogue) + "\n")
  execFileSync("pnpm", ["exec", "vp", "fmt", "catalogue.json"], { cwd: file("."), stdio: "inherit" })
  const json = JSON.stringify(used)
  writeFileSync(file("outlines.json"), json + "\n")
  console.log(
    `wrote ${questions.length} questions of ${types.join(", ")}; ${Object.keys(used).length} outlines, ${Math.round(json.length / 1024)} KB`
  )
}
