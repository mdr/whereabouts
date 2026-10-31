// Opens the production build (served by the packaged server, e.g. `nix run`)
// and checks the map loads: the MapLibre worker must be fetched as
// JavaScript, not the SPA fallback.
import { test } from "@playwright/test"
import { check, newTab } from "../tests/support.ts"

test("prod", async ({ browser }) => {
  const tab = await newTab(browser, "prod", { context: { viewport: { width: 1200, height: 800 } } })

  const problems: string[] = []
  tab.page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console.error: ${m.text()}`)
  })
  tab.page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`))
  tab.page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText ?? ""}`))
  tab.page.on("response", (r) => {
    const type = r.headers()["content-type"] ?? ""
    if (/\.(m?js)(\?|$)/.test(r.url()) && !type.includes("javascript")) {
      problems.push(`script served as ${type}: ${r.url()}`)
    }
  })

  const loaded = await tab.openPractice().then(
    () => true,
    () => false
  )
  check(loaded, "the map loads and practice is ready to play")
  check(problems.length === 0, `no errors${problems.length ? `: ${problems.join("; ")}` : ""}`)
})
