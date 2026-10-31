// How the build scripts write their questions: each replaces the catalogue's
// questions of its own types, keeping the rest, with the places they are
// about. Places and outlines follow the questions, so places.json holds
// exactly the places asked about and outlines.json exactly the areas painted.
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"

const ORDER = ["LANDMARK", "PLACE", "COUNTRY", "FLAG", "FEATURE", "STATE"]
const file = (name) => new URL(`../${name}`, import.meta.url)
const read = (name) => JSON.parse(readFileSync(file(name), "utf8"))

/**
 * Write `questions` as the catalogue's questions of `types`, with the places
 * they bring (over any of the same id, keeping what they leave out) and those places' outlines by id.
 */
export function writeQuestions(types, questions, places, outlines) {
  const kept = read("catalogue.json").filter((q) => !types.includes(q.type))
  const catalogue = [...kept, ...questions]
    .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type))
    .map(({ id, type, place, clue, answer }) => ({ id, type, place, clue, answer }))
  const allPlaces = new Map(read("places.json").map((p) => [p.id, p]))
  for (const p of places) allPlaces.set(p.id, { ...allPlaces.get(p.id), ...p })
  const asked = new Map()
  for (const q of catalogue) {
    const place = allPlaces.get(q.place)
    if (!place) throw new Error(`${q.id}: no place ${q.place}`)
    if (asked.has(q.place)) continue
    const { id, label, wiki, at, feature, area, flag } = place
    asked.set(id, {
      id,
      label,
      wiki,
      ...(at ? { at } : {}),
      ...(feature ? { feature } : {}),
      ...(area ? { area } : {}),
      ...(flag ? { flag } : {})
    })
  }
  const allOutlines = { ...read("outlines.json"), ...outlines }
  const used = {}
  for (const q of catalogue) {
    if (q.answer.type !== "AREA") continue
    const id = asked.get(q.place).area?.outline
    if (!allOutlines[id]) throw new Error(`${q.id}: no outline ${id}`)
    used[id] = allOutlines[id]
  }
  writeFileSync(file("catalogue.json"), JSON.stringify(catalogue) + "\n")
  writeFileSync(file("places.json"), JSON.stringify([...asked.values()]) + "\n")
  execFileSync("pnpm", ["exec", "vp", "fmt", "catalogue.json", "places.json"], { cwd: file("."), stdio: "inherit" })
  const json = JSON.stringify(used)
  writeFileSync(file("outlines.json"), json + "\n")
  console.log(
    `wrote ${questions.length} questions of ${types.join(", ")}; ${asked.size} places, ${Object.keys(used).length} outlines, ${Math.round(json.length / 1024)} KB`
  )
}
