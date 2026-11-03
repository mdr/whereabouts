import { test, type Browser, type BrowserContext, type BrowserContextOptions } from "@playwright/test"
import { Tab } from "../pages/Tab.ts"
import type { GameConnection } from "../game-server/route-socket.ts"

/** The local Chrome, headless, with WebGL in software so the map draws without a GPU. */
export const SWIFTSHADER = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
export const CHROME = { channel: "chrome", headless: true, launchOptions: { args: SWIFTSHADER } }

export interface TabOptions {
  context?: BrowserContextOptions
  dev?: boolean
  baseUrl?: string
  /** Runs in the page before any of the app's scripts. */
  initScript?: () => void
}

/**
 * A new browser context and tab, with its page errors logged under `label`.
 * `connect` decides where the tab's game socket goes (see newTab, newE2eTab).
 */
export const openTab = async (
  browser: Browser,
  label: string,
  options: TabOptions,
  connect: (context: BrowserContext) => Promise<GameConnection | undefined>
): Promise<Tab> => {
  const context = await browser.newContext(options.context ?? { viewport: { width: 1300, height: 900 } })
  if (options.initScript) await context.addInitScript(options.initScript)
  const connection = await connect(context)
  const page = await context.newPage()
  page.on("pageerror", (error) => console.log(`[${label} pageerror]`, error.message))
  page.on("console", (message) => {
    if (message.type() === "error") console.log(`[${label} console.error]`, message.text().slice(0, 200))
  })
  const baseUrl = options.baseUrl ?? test.info().project.use.baseURL
  if (!baseUrl) throw new Error("no baseURL: set one in the Playwright config")
  const tab = new Tab(page, baseUrl, { dev: options.dev ?? false, connection })
  await tab.collectClientErrors()
  return tab
}

/** Where a test's screenshots go: its own folder under the output directory. */
export const shot = (name: string): string => test.info().outputPath(name)
