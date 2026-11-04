import { CoverageReport } from "monocart-coverage-reports"
import { COVERAGE, iwftCoverageOptions } from "./coverage-options.ts"

/**
 * The browser tests' globalSetup: starts the run's coverage afresh, and at
 * the end writes what the workers added as raw data.
 * @public
 */
export default async (): Promise<(() => Promise<void>) | undefined> => {
  if (!COVERAGE) return undefined
  new CoverageReport(iwftCoverageOptions).cleanCache()
  return async () => {
    await new CoverageReport(iwftCoverageOptions).generate()
  }
}
