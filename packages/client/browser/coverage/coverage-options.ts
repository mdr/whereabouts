import { fileURLToPath } from "node:url"
import type { CoverageReportOptions } from "monocart-coverage-reports"

/** Set by `task coverage`: the browser tests record which code they run. */
export const COVERAGE = process.env["COVERAGE"] === "1"

const repo = fileURLToPath(new URL("../../../../", import.meta.url))

/** Every worker adds to the same cache; the global teardown turns it into raw data for the merge. */
export const iwftCoverageOptions: CoverageReportOptions = {
  name: "Browser tests",
  outputDir: `${repo}smoke-out/coverage/iwft`,
  // Workers run in packages/client; paths are recorded from the root, as the unit tests' are.
  baseDir: repo,
  reports: ["raw"],
  logging: "error"
}
