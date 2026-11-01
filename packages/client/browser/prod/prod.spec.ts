// Opens the production build (served by the packaged server, e.g. `nix run`)
// and checks the map loads: the MapLibre worker must be fetched as
// JavaScript, not the SPA fallback.
import { expect, test } from "@playwright/test"
import { newTab } from "../tests/support.ts"

test("prod", async ({ browser }) => {
  const tab = await newTab(browser, "prod", { context: { viewport: { width: 1200, height: 800 } } })

  const problems: string[] = []
  tab.page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console.error: ${message.text()}`)
  })
  tab.page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`))
  tab.page.on("requestfailed", (request) =>
    problems.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ""}`)
  )
  tab.page.on("response", (response) => {
    const type = response.headers()["content-type"] ?? ""
    if (/\.(m?js)(\?|$)/.test(response.url()) && !type.includes("javascript")) {
      problems.push(`script served as ${type}: ${response.url()}`)
    }
  })

  await tab.openPractice()
  expect(problems, "the page has no errors").toEqual([])
})
