// Entering and leaving VR, on an emulated Quest 3 (see pages/Headset.ts).
// Saves screenshots of the headset's view.
import { test } from "@playwright/test"
import { vrButtonTestIds } from "../../src/ui/VrButtonTestIds.ts"
import { VrViewType } from "../../src/vr/view.ts"
import { until } from "../pages/support.ts"
import { check, shot } from "./support.ts"
import { headsetPractice } from "./vr-states.ts"
import { closeAllTabs, enterVr, newHeadsetTab, poses, pressMenu } from "./vr-support.ts"

test.afterEach(async ({ browser }) => closeAllTabs(browser))

/** As if loading outlasted the press: the browser would refuse it the headset. */
function staleClick(): void {
  Object.defineProperty(UserActivation.prototype, "isActive", { get: () => false })
}

test("practice's VR button opens a headset session, and Leave VR ends it", async ({ browser }) => {
  const { tab, headset, round } = await headsetPractice(browser, "vr-enter")
  const button = tab.page.getByTestId(vrButtonTestIds.button)
  check(await button.isVisible(), "a headset browser offers VR")
  const pressed = Date.now()
  await enterVr(tab, headset)
  check(
    (await button.innerText()).includes("In VR"),
    `the VR button opens a headset session, loading for ${((Date.now() - pressed) / 1000).toFixed(1)} s`
  )
  await round.pause(1500)
  await round.screenshot(shot(`vr-1-entered.png`))
  const startMenu = await headset.menu()
  check(
    startMenu.heading.startsWith("QUESTION 1 OF") && startMenu.more.map((m) => m.label).join() === "Home",
    `the menu heads the question and offers Home (${startMenu.heading}; ${startMenu.more.map((m) => m.label).join()})`
  )
  check(!(await headset.globeBordersShown()), "the globe shows no borders when the page's map would not")

  await tab.page.evaluate(() => window.whereaboutsVr.exit())
  await until(
    "the session to end",
    () => headset.inSession(),
    (on) => !on
  )
  check(true, "Leave VR leaves it")
  const drawnOnLeaving = await headset.scenesDrawn()
  await round.pause(500)
  const drawnSince = (await headset.scenesDrawn()) - drawnOnLeaving
  check(drawnSince === 0, `and the VR scene is no longer drawn on the page (${drawnSince} frames in 0.5 s)`)
})

test("when VR loads too late for the press, it waits to be asked again", async ({ browser }) => {
  const { tab, headset } = await headsetPractice(browser, "vr-stale", staleClick)
  await tab.page.getByTestId(vrButtonTestIds.button).click()
  check(await tab.page.getByTestId(vrButtonTestIds.loading).isVisible(), "loading VR covers the screen")
  const enterButton = tab.page.getByTestId(vrButtonTestIds.enterButton)
  await enterButton.waitFor({ timeout: 60_000 })
  check(!(await headset.inSession()), "once the press has gone stale, VR waits to be asked again")
  await enterButton.click()
  await until(
    "the headset session",
    () => headset.inSession(),
    (on) => on,
    60_000
  )
})

test("VR from the home screen stays on into practice", async ({ browser }) => {
  const { tab, headset } = await newHeadsetTab(browser, "vr-home")
  const homePage = await tab.openHome()
  await enterVr(tab, headset)
  const homeView = await until(
    "the menu in VR",
    () => headset.view(),
    (v) => v === VrViewType.LOBBY
  )
  const offered = (await headset.menu()).actions.map((a) => a.label).join(", ")
  check(homeView === VrViewType.LOBBY && offered === "Practise, Change topic", `the home screen opens VR (${offered})`)
  await homePage.pause(1500)
  await homePage.screenshot(shot(`vr-12-home.png`))
  await pressMenu(headset, (await poses(headset)).can, "act0")
  const practising = await until(
    "practice in VR",
    () => headset.view(),
    (v) => v === VrViewType.PAINT,
    30_000
  )
  check(
    practising === VrViewType.PAINT && (await headset.inSession()),
    "Practise in VR starts practice, the headset still on"
  )
})
