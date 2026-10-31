// The browser tests, against dev servers of their own on spare ports, so a
// `pnpm dev` already running is left alone. `task e2e` runs them.
import { defineConfig } from "@playwright/test"
import { CHROME } from "./browser/tests/support.ts"

const clientPort = process.env.CLIENT_PORT ?? "5180"
const gamePort = process.env.PORT ?? "8790"
// Short rounds, which every test copes with (reconnect picks its own).
const env = { CLIENT_PORT: clientPort, PORT: gamePort, ROUND_MS: "12000", ROUNDS: "2", CONNECTIONS_PER_ADDRESS: "1000" }
const LONG = /\/(vr|vr-multiplayer|load-failures)\.spec\.ts$/
const TIMED = /\/(sound|deadline)\.spec\.ts$/

export default defineConfig({
  testDir: "browser/tests",
  outputDir: "../../smoke-out/e2e",
  timeout: 5 * 60_000,
  workers: 3,
  reporter: [["list"], ["html", { outputFolder: "../../smoke-out/e2e-report", open: "never" }]],
  use: { ...CHROME, baseURL: `http://localhost:${clientPort}` },
  projects: [
    // Listed first so the longest start first and the run ends sooner.
    { name: "long", testMatch: LONG },
    { name: "main", testIgnore: [LONG, TIMED] },
    // These time the round clock, which load from the others would skew.
    { name: "timed", testMatch: TIMED, dependencies: ["long", "main"], workers: 1 }
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
