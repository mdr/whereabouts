import type { Page } from "@playwright/test"
import { CoverageReport } from "monocart-coverage-reports"
import { COVERAGE, iwftCoverageOptions } from "./coverage-options.ts"

const recording = new Set<Page>()

/** The app's own modules as the dev server serves them, not Vite's or the dependencies'. */
const isAppScript = (url: string): boolean => {
  if (!URL.canParse(url)) return false
  const { pathname } = new URL(url)
  return (pathname.startsWith("/src/") || pathname.startsWith("/@fs/")) && !pathname.includes("/node_modules/")
}

/** Records the JavaScript a new tab runs, until the test ends (see coverage-test.ts). */
export const startPageCoverage = async (page: Page): Promise<void> => {
  if (!COVERAGE) return
  await page.coverage.startJSCoverage({ resetOnNavigation: false })
  recording.add(page)
}

/** Adds what the test's tabs ran to the run's coverage. */
export const savePageCoverage = async (): Promise<void> => {
  const pages = [...recording].filter((page) => !page.isClosed())
  recording.clear()
  const entries = (await Promise.all(pages.map((page) => page.coverage.stopJSCoverage().catch(() => [])))).flat()
  const appEntries = entries.filter((entry) => isAppScript(entry.url))
  if (appEntries.length > 0) await new CoverageReport(iwftCoverageOptions).add(appEntries)
}
