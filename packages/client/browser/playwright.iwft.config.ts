// The isolated browser tests (*.iwft.ts): the client from a Vite dev server
// of their own, on a free port, and nothing else. Each test that plays starts the game
// server in its own process, and tabs answer the network from the offline
// world, so nothing outside needs to be up. `task iwft` runs them.
import { defineConfig } from "@playwright/test"
import { devServer, portsIn, runSettings } from "./playwright-common.ts"

const { CLIENT_PORT: clientPort } = await portsIn("CLIENT_PORT")
const LONG = /\/(vr\/[a-z-]+|load-failures)\.iwft\.ts$/

export default defineConfig({
  ...runSettings("iwft", clientPort),
  projects: [
    // Listed first so the longest start first and the run ends sooner.
    { name: "long", testMatch: LONG, fullyParallel: true },
    { name: "iwft", testMatch: /\.iwft\.ts$/, testIgnore: LONG }
  ],
  webServer: [devServer("client", `http://localhost:${clientPort}`, { CLIENT_PORT: clientPort })]
})
