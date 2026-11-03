import type { Browser } from "@playwright/test"
import type { InProcessOptions } from "../../../server/src/test-support/in-process-server.ts"
import type { TestGame } from "../game-server/game-server.ts"
import type { Instant } from "@whereabouts/shared/units"
import type { Tab } from "../pages/Tab.ts"
import { newTab } from "./iwft-tab.ts"

/** The time the page and the server both stand at, so countdowns read the same each run. */
const STILL_DATE = Date.UTC(2026, 0, 1, 12) as Instant
const SEED = 0x5eed

/** A fixed sequence (mulberry32) in place of Math.random. Self-contained, so it also runs in the page. */
const seeded = (seed: number): (() => number) => {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** For screenshots: the in-process server with its clock stopped and its room codes from a seed. */
export const stillServer = (options: InProcessOptions): InProcessOptions => ({
  ...options,
  frozenAt: STILL_DATE,
  random: seeded(SEED)
})

/** For screenshots: a tab on a still server whose date and Math.random are the same every run. */
export const newStillTab = async (browser: Browser, label: string, game: TestGame): Promise<Tab> => {
  const tab = await newTab(browser, label, {
    game,
    initScript: { content: `Math.random = (${seeded.toString()})(${SEED})` }
  })
  await tab.holdDateAt(STILL_DATE)
  return tab
}
