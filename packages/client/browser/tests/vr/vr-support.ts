// Helpers for the specs run in an emulated headset (see pages/headset/Headset.ts).
import type { Browser } from "@playwright/test"
import type { Headset } from "../../pages/headset/Headset.ts"
import type { Screen } from "../../pages/Screen.ts"
import type { Tab } from "../../pages/Tab.ts"
import type { TestGame } from "../../game-server/game-server.ts"
import { newOfflineTab, newTab } from "../iwft-tab.ts"
import type { TabOptions } from "../support.ts"
import { Hand } from "../../../src/vr/hands/hand.ts"
import type { Vec3 } from "../../../src/vr/probe.ts"

/** A new tab in an emulated headset. With `game` it plays on that server; without, it never joins a game. `initScript` runs in the page, so it can't use variables from outside it. */
export const newHeadsetTab = async (
  browser: Browser,
  label: string,
  initScript?: () => void,
  game?: TestGame
): Promise<{ tab: Tab; headset: Headset }> => {
  const options: TabOptions = { context: { viewport: { width: 1200, height: 800 } }, initScript }
  const tab = game ? await newTab(browser, label, { ...options, game }) : await newOfflineTab(browser, label, options)
  return { tab, headset: await tab.installHeadset() }
}

/** Press the page's VR button and wait for the headset session. */
export const enterVr = async (headset: Headset): Promise<void> => {
  await headset.pressVrButton()
  // The first sessions after the dev server starts load the VR code cold, several at once.
  await headset.expectInSession(90_000)
}

/**
 * Where the globe's centre starts and where the right hand holds the can. The globe starts 45 cm
 * ahead of the eyes and 30 cm below them, its near side there, 22 cm in radius.
 */
export const poses = async (headset: Headset): Promise<{ centre: Vec3; can: Vec3 }> => {
  const [x, y, z] = await headset.eyes()
  return { centre: [x, y - 0.3, z - 0.67], can: [x + 0.15, y - 0.25, z - 0.15] }
}

/**
 * A short stroke from the same spot each time, across the middle of the globe. With `expectDroplets`,
 * checks that it throws droplets while the trigger is still held.
 */
export const spray = async (
  headset: Headset,
  screen: Screen,
  { centre, can }: { centre: Vec3; can: Vec3 },
  { screenshot, expectDroplets = false }: { screenshot?: string; expectDroplets?: boolean } = {}
): Promise<void> => {
  // The menu lays out late; a ray on it mid-stroke ends the stroke, and the spray becomes two undo steps.
  await headset.panels.menuButton("done")
  await headset.controllers.pointRight(can, centre)
  await headset.aimedAt(Hand.RIGHT)
  await headset.controllers.rightTrigger(1)
  for (let i = 0; i < 10; i++) {
    await headset.controllers.pointRight(can, [centre[0] + 0.01 * i, centre[1], centre[2]])
    await headset.frames(2)
  }
  if (screenshot) await screen.screenshot(screenshot)
  if (expectDroplets) await headset.scene.expectParticles({ greaterThan: 20 })
  await headset.controllers.rightTrigger(0)
}

/** Points the right hand from `from` at a button of the VR menu and pulls the trigger. */
export const pressMenu = async (headset: Headset, from: Vec3, id: string): Promise<void> => {
  await headset.controllers.press(from, await headset.panels.menuButton(id))
}

/** Points the right hand from `from` at the score table's row for `name` and pulls the trigger. */
export const pressScoreRow = async (headset: Headset, from: Vec3, name: string): Promise<void> => {
  await headset.controllers.press(from, await headset.panels.scoreRow(name))
}

/** Closes every tab the test opened: a headset left running slows the worker's next test. */
export const closeAllTabs = async (browser: Browser): Promise<void> => {
  await Promise.all(browser.contexts().map((context) => context.close()))
}
