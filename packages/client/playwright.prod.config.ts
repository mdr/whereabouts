// The production check, against a site already running: PROD_URL, or the
// packaged server on its default port.
import { defineConfig } from "@playwright/test"
import { CHROME } from "./browser/tests/support.ts"

export default defineConfig({
  testDir: "browser/prod",
  outputDir: "../../smoke-out/e2e-prod",
  testMatch: /\.e2e\.ts$/,
  use: { ...CHROME, baseURL: process.env["PROD_URL"] || "http://localhost:8799" }
})
