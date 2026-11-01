// Helpers for the specs run in an emulated headset (see pages/headset/Headset.ts).
import type { Browser } from "@playwright/test"
import { vrButtonTestIds } from "../../../src/ui/VrButton/VrButtonTestIds.ts"
import { Headset } from "../../pages/headset/Headset.ts"
import type { Screen } from "../../pages/Screen.ts"
import { until } from "../../pages/support.ts"
import type { Tab } from "../../pages/Tab.ts"
import { newTab } from "../support.ts"
import type { Vec3 } from "../../../src/vr/probe.ts"

/** A new tab in an emulated headset. `initScript` runs in the page, so it can't use variables from outside it. */
export async function newHeadsetTab(
  browser: Browser,
  label: string,
  initScript?: () => void
): Promise<{ tab: Tab; headset: Headset }> {
  const tab = await newTab(browser, label, { context: { viewport: { width: 1200, height: 800 } }, initScript })
  return { tab, headset: await Headset.install(tab.page) }
}

/** Press the page's VR button and wait for the headset session. */
export async function enterVr(tab: Tab, headset: Headset): Promise<void> {
  await tab.page.getByTestId(vrButtonTestIds.button).click()
  // The first sessions after the dev server starts load the VR code cold, several at once.
  await until(
    "the headset session",
    () => headset.inSession(),
    (on) => on,
    90_000
  )
}

/**
 * Where the globe's centre starts and where the right hand holds the can. The globe starts 45 cm
 * ahead of the eyes and 30 cm below them, its near side there, 22 cm in radius.
 */
export async function poses(headset: Headset): Promise<{ centre: Vec3; can: Vec3 }> {
  const [x, y, z] = await headset.eyes()
  return { centre: [x, y - 0.3, z - 0.67], can: [x + 0.15, y - 0.25, z - 0.15] }
}

/** A short stroke from the same spot each time, across the middle of the globe; returns the droplets in the air. */
export async function spray(
  headset: Headset,
  screen: Screen,
  { centre, can }: { centre: Vec3; can: Vec3 },
  screenshot?: string
): Promise<number> {
  // The menu lays out late; a ray on it mid-stroke ends the stroke, and the spray becomes two undo steps.
  await headset.panels.menuButton("done")
  await headset.controllers.pointRight(can, centre)
  await screen.pause(300)
  await headset.controllers.rightTrigger(1)
  for (let i = 0; i < 10; i++) {
    await headset.controllers.pointRight(can, [centre[0] + 0.01 * i, centre[1], centre[2]])
    await screen.pause(100)
  }
  if (screenshot) await screen.screenshot(screenshot)
  const droplets = await headset.scene.particles()
  await headset.controllers.rightTrigger(0)
  return droplets
}

/** Points the right hand from `from` at a button of the VR menu and pulls the trigger. */
export async function pressMenu(headset: Headset, from: Vec3, id: string): Promise<void> {
  await headset.controllers.press(from, await headset.panels.menuButton(id))
}

/** Closes every tab the test opened: a headset left running slows the worker's next test. */
export async function closeAllTabs(browser: Browser): Promise<void> {
  await Promise.all(browser.contexts().map((context) => context.close()))
}
