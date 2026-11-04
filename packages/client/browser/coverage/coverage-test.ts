import { test as base } from "@playwright/test"
import { saveNodeCoverage } from "./node-coverage.ts"
import { savePageCoverage } from "./page-coverage.ts"

/* oxlint-disable no-empty-pattern -- Playwright reads a fixture's dependencies from its first parameter, which must be a pattern */

/** Playwright's test, saving coverage after each test and each worker when COVERAGE is set. */
export const test = base.extend<{ pageCoverage: undefined }, { nodeCoverage: undefined }>({
  pageCoverage: [
    async ({}, use) => {
      await use(undefined)
      await savePageCoverage()
    },
    { auto: true }
  ],
  nodeCoverage: [
    async ({}, use) => {
      await use(undefined)
      await saveNodeCoverage()
    },
    { auto: true, scope: "worker" }
  ]
})
