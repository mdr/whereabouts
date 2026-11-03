// What the iwft and e2e Playwright configs share.
import type { PlaywrightTestConfig } from "@playwright/test"
import { CHROME } from "./tests/support.ts"

type WebServer = NonNullable<Exclude<PlaywrightTestConfig["webServer"], unknown[]>>

/** Settings for a run whose output goes to smoke-out/<name>/ and its report to smoke-out/<name>-report/. */
export const runSettings = (name: string, clientPort: string): PlaywrightTestConfig => ({
  testDir: "tests",
  outputDir: `../../../smoke-out/${name}`,
  timeout: 5 * 60_000,
  workers: 3,
  reporter: [["list"], ["html", { outputFolder: `../../../smoke-out/${name}-report`, open: "never" }]],
  use: { ...CHROME, baseURL: `http://localhost:${clientPort}` }
})

/** A dev server of the run's own, never one already running. */
export const devServer = (workspace: string, url: string, env: Record<string, string>): WebServer => ({
  command: `pnpm --filter ./packages/${workspace} dev`,
  cwd: "../../..",
  env,
  url,
  reuseExistingServer: false
})
