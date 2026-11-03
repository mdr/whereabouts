// A practice round's answer in VR, on an emulated Quest 3 (see pages/headset/Headset.ts).
// Saves screenshots of the headset's view.
import { test } from "@playwright/test"
import { PracticeRevealPage } from "../../pages/PracticeRevealPage.ts"
import { VrViewType } from "../../../src/vr/view/view.ts"
import { shot } from "../support.ts"
import { vrPracticeAnswer, vrPracticePainted } from "./vr-states.ts"
import { closeAllTabs, pressMenu } from "./vr-support.ts"

test.afterEach(async ({ browser }) => closeAllTabs(browser))

test("Done in VR shows the answer in the headset, and Next brings the next round, where Pass scores 250", async ({
  browser
}) => {
  const { tab, headset, round, can } = await vrPracticePainted(browser, "vr-submit")
  // Done with the menu's button, pointing and pulling the trigger: the
  // headset stays on and shows the answer, and Next brings the next round to it.
  await headset.panels.expectDoneLabel("Done")
  await pressMenu(headset, can, "done")
  const reveal = await PracticeRevealPage.whenShownInHeadset(tab)
  await reveal.expectScore({ atLeast: 0, atMost: 1000 })
  await headset.panels.expectView(VrViewType.REVEAL)
  await headset.expectInSession()
  await headset.panels.expectFact()
  await headset.panels.expectPostcardShown()
  await headset.scene.expectToolsHeld(false)
  await headset.scene.expectControllersShown(true)
  await headset.scene.expectGlobeColour(true, { timeout: 30_000 })
  await headset.scene.expectGlobeBorders(true)
  await headset.settle()
  await round.screenshot(shot(`vr-reveal.png`))
  await round.screenshot(shot(`vr-8-answer.png`))
  await reveal.next()
  await headset.panels.expectView(VrViewType.PAINT)
  await headset.expectInSession()
  await headset.scene.expectGlobeColour(false)
  await headset.panels.expectDoneLabel("Pass")
  await pressMenu(headset, can, "done")
  await headset.panels.expectView(VrViewType.REVEAL)
  const passed = await PracticeRevealPage.whenShownInHeadset(tab)
  await passed.expectScore({ exactly: 250 })
  await round.screenshot(shot(`vr-10-passed.png`))
})

test("See your room swaps space for passthrough, the answer still showing", async ({ browser }) => {
  const { headset, round, can } = await vrPracticeAnswer(browser, "vr-passthrough")
  // See your room swaps space for passthrough, in a new session, still on the answer.
  await pressMenu(headset, can, "passthrough")
  await headset.scene.expectPassthroughShown({ timeout: 30_000 })
  await headset.expectInSession()
  await headset.panels.expectView(VrViewType.REVEAL)
  await headset.scene.expectNoMoon()
  await headset.settle()
  await round.screenshot(shot(`vr-11d-passthrough.png`))
})
