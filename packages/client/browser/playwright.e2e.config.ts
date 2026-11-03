// The end-to-end browser tests (*.e2e.ts): the client and the game server
// as dev servers of their own, on free ports, with short rounds. `task e2e` runs them.
import { defineConfig } from "@playwright/test"
import { devServer, portsIn, runSettings } from "./playwright-common.ts"

const { CLIENT_PORT: clientPort, PORT: gamePort } = await portsIn("CLIENT_PORT", "PORT")
const env = { CLIENT_PORT: clientPort, PORT: gamePort, ROUND_MS: "12000", ROUNDS: "2", CONNECTIONS_PER_ADDRESS: "1000" }

export default defineConfig({
  ...runSettings("e2e", clientPort),
  testMatch: /\.e2e\.ts$/,
  webServer: [
    devServer("server", `http://localhost:${gamePort}/api/health`, env),
    devServer("client", `http://localhost:${clientPort}`, env)
  ]
})
