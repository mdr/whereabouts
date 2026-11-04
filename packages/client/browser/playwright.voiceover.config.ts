// Specs that listen with the real VoiceOver (voiceover/*.voiceover.ts), over a headed Chrome:
// run by hand, never in a suite, since they take over the Mac. `task voiceover -- <spec>` runs one.
import { defineConfig } from "@playwright/test"
import { devServer, portsIn, runSettings } from "./playwright-common.ts"

const { CLIENT_PORT: clientPort } = await portsIn("CLIENT_PORT")
const settings = runSettings("voiceover", clientPort)

export default defineConfig({
  ...settings,
  testDir: "voiceover",
  testMatch: /\.voiceover\.ts$/,
  timeout: 20 * 60_000,
  workers: 1,
  use: { ...settings.use, headless: false },
  webServer: [devServer("client", `http://localhost:${clientPort}`, { CLIENT_PORT: clientPort })]
})
