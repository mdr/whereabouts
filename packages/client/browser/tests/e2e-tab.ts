import type { Browser } from "@playwright/test"
import type { Tab } from "../pages/Tab.ts"
import { openTab, type TabOptions } from "./support.ts"

/** A tab that plays on the dev servers' real game server, through the client's own proxy. */
export const newE2eTab = (browser: Browser, label: string, options: TabOptions = {}): Promise<Tab> =>
  openTab(browser, label, options, async () => undefined)
