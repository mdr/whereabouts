// The browser tests. *.iwft.ts specs play on a game server in the test's own
// process (or need none); *.e2e.ts specs use the dev servers started here, on
// spare ports so a `pnpm dev` already running is left alone. `task e2e` runs them.
import { defineConfig } from "@playwright/test"
import { CHROME } from "./browser/tests/support.ts"

const clientPort = process.env["CLIENT_PORT"] ?? "5180"
const gamePort = process.env["PORT"] ?? "8790"
// Short rounds for the e2e specs.
const env = { CLIENT_PORT: clientPort, PORT: gamePort, ROUND_MS: "12000", ROUNDS: "2", CONNECTIONS_PER_ADDRESS: "1000" }
const LONG = /\/(vr\/[a-z-]+|load-failures)\.iwft\.ts$/

export default defineConfig({
  testDir: "browser/tests",
  outputDir: "../../smoke-out/e2e",
  timeout: 5 * 60_000,
  workers: 3,
  reporter: [["list"], ["html", { outputFolder: "../../smoke-out/e2e-report", open: "never" }]],
  use: { ...CHROME, baseURL: `http://localhost:${clientPort}` },
  projects: [
    // Listed first so the longest start first and the run ends sooner.
    { name: "long", testMatch: LONG, fullyParallel: true },
    { name: "iwft", testMatch: /\.iwft\.ts$/, testIgnore: LONG },
    // Needs the game server below: Playwright cannot start it for this project alone.
    { name: "e2e", testMatch: /\.e2e\.ts$/ }
  ],
  webServer: [
    {
      command: "pnpm --filter ./packages/server dev",
      cwd: "../..",
      env,
      url: `http://localhost:${gamePort}/api/health`,
      reuseExistingServer: false
    },
    {
      command: "pnpm --filter ./packages/client dev",
      cwd: "../..",
      env,
      url: `http://localhost:${clientPort}`,
      reuseExistingServer: false
    }
  ]
})
