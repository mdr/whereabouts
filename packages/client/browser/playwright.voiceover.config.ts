// The VoiceOver exploration (voiceover/*.voiceover.ts): drives the real VoiceOver over a headed
// Chrome, so it takes over the Mac while it runs. `task voiceover -- <script>` runs it.
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
