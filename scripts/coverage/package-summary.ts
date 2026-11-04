export interface CoveredFile {
  sourcePath: string
  summary: { lines: { covered: number; total: number } }
}

interface Tally {
  covered: number
  total: number
  files: number
  untouched: number
}

const percent = ({ covered, total }: Tally): string => (total === 0 ? "-" : `${((covered / total) * 100).toFixed(1)}%`)

const add = (tally: Tally, file: CoveredFile): Tally => ({
  covered: tally.covered + file.summary.lines.covered,
  total: tally.total + file.summary.lines.total,
  files: tally.files + 1,
  untouched: tally.untouched + (file.summary.lines.covered === 0 ? 1 : 0)
})

const empty: Tally = { covered: 0, total: 0, files: 0, untouched: 0 }

/** Line coverage for each package and overall, as a small table. */
export const packageSummary = (files: readonly CoveredFile[]): string => {
  const byPackage = new Map<string, Tally>()
  for (const file of files) {
    const name = /^packages\/([^/]+)\//.exec(file.sourcePath)?.[1] ?? "other"
    byPackage.set(name, add(byPackage.get(name) ?? empty, file))
  }
  const overall = files.reduce(add, empty)
  const rows = [...[...byPackage].sort(([a], [b]) => a.localeCompare(b)), ["all", overall] as const]
  return [
    "package  lines   covered/total   files (none covered)",
    ...rows.map(
      ([name, tally]) =>
        `${name.padEnd(8)} ${percent(tally).padStart(6)}  ${`${tally.covered}/${tally.total}`.padStart(14)}   ${tally.files} (${tally.untouched})`
    )
  ].join("\n")
}
