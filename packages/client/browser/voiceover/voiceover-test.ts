/**
 * Specs that listen to a screen with the real VoiceOver (see docs/screen-reader-testing.md):
 * `tab` plays on the test's in-process server, and `listen` starts VoiceOver on it once the
 * spec has driven the app where it wants, stopping it after the test.
 */
import { voiceOver } from "@guidepup/guidepup"
import { test as base } from "../game-server/game-server.ts"
import type { Tab } from "../pages/Tab.ts"
import { newTab } from "../tests/iwft-tab.ts"
import { ScreenReader } from "./ScreenReader.ts"

export const test = base.extend<{ tab: Tab; listen: () => Promise<ScreenReader> }>({
  tab: async ({ browser, game }, use) => {
    await use(await newTab(browser, "VoiceOver", { game }))
  },
  listen: async ({ tab }, use) => {
    const session = { started: false }
    await use(async () => {
      await voiceOver.start()
      session.started = true
      const screenReader = new ScreenReader(voiceOver, tab)
      await screenReader.enterPage()
      return screenReader
    })
    if (session.started) await voiceOver.stop()
  }
})
