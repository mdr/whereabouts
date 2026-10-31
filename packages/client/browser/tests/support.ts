import { expect, test, type Browser, type BrowserContextOptions } from "@playwright/test"
import { Tab } from "../pages/Tab.ts"

/** The local Chrome, headless, with WebGL in software so the map draws without a GPU. */
const SWIFTSHADER = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
export const CHROME = { channel: "chrome", headless: true, launchOptions: { args: SWIFTSHADER } }

export interface PlayerOptions {
  context?: BrowserContextOptions
  dev?: boolean
  baseUrl?: string
  /** Runs in the page before any of the app's scripts. */
  initScript?: () => void
}

/** A new browser context and tab, with its page errors logged under `label`. */
export async function newTab(browser: Browser, label: string, options: PlayerOptions = {}): Promise<Tab> {
  const context = await browser.newContext(options.context ?? { viewport: { width: 1300, height: 900 } })
  if (options.initScript) await context.addInitScript(options.initScript)
  const page = await context.newPage()
  page.on("pageerror", (e) => console.log(`[${label} pageerror]`, e.message))
  page.on("console", (m) => {
    if (m.type() === "error") console.log(`[${label} console.error]`, m.text().slice(0, 200))
  })
  const baseUrl = options.baseUrl ?? test.info().project.use.baseURL
  if (!baseUrl) throw new Error("no baseURL: set one in the Playwright config")
  return new Tab(page, baseUrl, { dev: options.dev ?? false })
}

/** A named check that lets the test carry on when it fails, so one run reports every failure. */
export function check(ok: boolean, what: string): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`)
  expect.soft(ok, what).toBe(true)
}

/** Where a test's screenshots go: its own folder under the output directory. */
export const shot = (name: string): string => test.info().outputPath(name)
