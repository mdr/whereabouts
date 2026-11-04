// Merges the raw coverage the unit tests and the browser tests wrote under
// smoke-out/coverage/ into one report. `task coverage` runs it; name the runs
// to merge (unit, iwft) to see fewer, e.g. `node scripts/coverage/merge-coverage.ts unit`.
import { existsSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { CoverageReport, type CoverageResults } from "monocart-coverage-reports"
import { transformWithOxc } from "vite-plus"
import { packageSummary } from "./package-summary.ts"
import { isMeasured, repoSourcePath } from "./source-path.ts"

const repo = fileURLToPath(new URL("../../", import.meta.url))
const out = `${repo}smoke-out/coverage`
const RUNS: Record<string, string> = { unit: `${out}/unit/raw`, iwft: `${out}/iwft/raw` }

const names = process.argv.length > 2 ? process.argv.slice(2) : Object.keys(RUNS)
const inputDir = names.map((name) => {
  const dir = RUNS[name]
  if (!dir) throw new Error(`no run called ${name}: one of ${Object.keys(RUNS).join(", ")}`)
  if (!existsSync(dir)) throw new Error(`no coverage from ${name} yet: run task coverage:${name}`)
  return dir
})

const fromRepo = (path: string): string => (path.startsWith(repo) ? path.slice(repo.length) : path)

const writeSummary = (results: CoverageResults | undefined): void => {
  if (!results) return
  const table = packageSummary(results.files)
  writeFileSync(`${out}/report/packages.txt`, `${table}\n`)
  console.log(`\nLines covered by ${names.join(" and ")}:\n${table}\n\nReport: ${results.reportPath}`)
}

await new CoverageReport({
  name: `Whereabouts coverage: ${names.join(" + ")}`,
  inputDir,
  outputDir: `${out}/report`,
  baseDir: repo,
  logging: "error",
  sourcePath: (sourcePath, { distFile }) => repoSourcePath(sourcePath, distFile, repo),
  outputFilter: (file) => isMeasured(file.sourcePath),
  // Files nothing ran show at 0%.
  all: {
    dir: ["packages/client/src", "packages/server/src", "packages/shared/src"].map((dir) => `${repo}${dir}`),
    filter: (path) => isMeasured(fromRepo(path)) && "js",
    transformer: async (entry) => {
      const path = fileURLToPath(entry.url)
      const { code, map } = await transformWithOxc(entry.source, path, { sourcemap: true })
      entry.source = code
      entry.sourceMap = map
    }
  },
  reports: [["v8"], ["console-summary"], ["text-summary", { file: "summary.txt" }]],
  onEnd: writeSummary
}).generate()
