// Entering and leaving VR, on an emulated Quest 3 (see pages/headset/Headset.ts).
// Saves screenshots of the headset's view.
import { test } from "@playwright/test"
import { VrViewType } from "../../../src/vr/view/view.ts"
import { shot } from "../support.ts"
import { headsetPractice } from "./vr-states.ts"
import { closeAllTabs, enterVr, newHeadsetTab, poses, pressMenu } from "./vr-support.ts"

test.afterEach(async ({ browser }) => closeAllTabs(browser))

/** As if loading outlasted the press: the browser would refuse it the headset. */
const staleClick = (): void => {
  Object.defineProperty(UserActivation.prototype, "isActive", { get: () => false })
}

test("practice's VR button opens a headset session, and Leave VR ends it", async ({ browser }) => {
  const { headset, round } = await headsetPractice(browser, "vr-enter")
  await headset.expectVrButtonOffered()
  await enterVr(headset)
  await headset.expectVrButtonInVr()
  await headset.settle()
  await round.screenshot(shot(`vr-1-entered.png`))
  await headset.panels.expectHeading(/^QUESTION 1 OF/)
  await headset.panels.expectMoreActions(["Home"])
  await headset.scene.expectNoGlobeBordersFor()

  await headset.leave()
  await headset.expectOutOfSession()
  await headset.expectSceneStaysUndrawn()
})

test("when VR loads too late for the press, it waits to be asked again", async ({ browser }) => {
  const { headset } = await headsetPractice(browser, "vr-stale", staleClick)
  await headset.pressVrButton()
  await headset.expectLoadingShown()
  await headset.expectEnterButtonOffered(60_000)
  await headset.expectStaysOutOfSession()
  await headset.pressEnterButton()
  await headset.expectInSession(60_000)
})

test("VR from the home screen stays on into practice", async ({ browser }) => {
  const { tab, headset } = await newHeadsetTab(browser, "vr-home")
  const homePage = await tab.openHome()
  await enterVr(headset)
  await headset.panels.expectView(VrViewType.LOBBY)
  await headset.panels.expectActions(["Practise", "Change topic"])
  await headset.settle()
  await homePage.screenshot(shot(`vr-12-home.png`))
  await pressMenu(headset, (await poses(headset)).can, "act0")
  await headset.panels.expectView(VrViewType.PAINT, { timeout: 30_000 })
  await headset.expectInSession()
})
