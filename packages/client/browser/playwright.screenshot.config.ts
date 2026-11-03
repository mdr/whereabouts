// The screenshot tests (*.screenshot.ts): IWFTs that drive the client to a
// state and compare it with a saved picture, once at desktop size and once
// at phone size. Run on one machine only: pictures from another would differ.
// `task screenshots` runs them, `task screenshots -- --update-snapshots` saves
// new pictures.
import { defineConfig, devices } from "@playwright/test"
import { devServer, portsIn, runSettings } from "./playwright-common.ts"

const { CLIENT_PORT: clientPort } = await portsIn("CLIENT_PORT")
const settings = runSettings("screenshots", clientPort)

export default defineConfig({
  ...settings,
  testMatch: /\.screenshot\.ts$/,
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFileName}/{arg}.{projectName}{ext}",
  // Longer than the usual 5 s: the first page waits on a cold dev server's fonts.
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { animations: "disabled", caret: "hide", scale: "css", maxDiffPixels: 0 }
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1300, height: 900 } } },
    {
      name: "phone",
      use: {
        viewport: devices["iPhone 13"].viewport,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 1
      }
    }
  ],
  webServer: [devServer("client", `http://localhost:${clientPort}`, { CLIENT_PORT: clientPort })]
})
