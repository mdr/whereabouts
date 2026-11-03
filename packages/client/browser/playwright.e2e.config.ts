// The end-to-end browser tests (*.e2e.ts): the client and the game server
// as dev servers of their own, on ports apart from the iwft run's and from
// `pnpm dev`, with short rounds. `task e2e` runs them.
import { defineConfig } from "@playwright/test"
import { devServer, runSettings } from "./playwright-common.ts"

const clientPort = process.env["CLIENT_PORT"] ?? "5190"
const gamePort = process.env["PORT"] ?? "8790"
const env = { CLIENT_PORT: clientPort, PORT: gamePort, ROUND_MS: "12000", ROUNDS: "2", CONNECTIONS_PER_ADDRESS: "1000" }

export default defineConfig({
  ...runSettings("e2e", clientPort),
  testMatch: /\.e2e\.ts$/,
  webServer: [
    devServer("server", `http://localhost:${gamePort}/api/health`, env),
    devServer("client", `http://localhost:${clientPort}`, env)
  ]
})
