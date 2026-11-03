// The map, the outlines and VR failing to load, against the Vite dev
// server: the player is told, and Try again loads them once they can be
// fetched. VR runs on an emulated headset (see pages/headset/Headset.ts).
import { test } from "@playwright/test"
import { Headset } from "../pages/headset/Headset.ts"
import { PracticeRoundPage } from "../pages/PracticeRoundPage.ts"
import { ScoreReviewPage } from "../pages/ScoreReviewPage.ts"
import { LoadFailures } from "../pages/LoadFailures.ts"
import { newOfflineTab } from "./iwft-tab.ts"

test("load-failures", async ({ browser }) => {
  await test.step("a map that will not load says so, and Try again loads it", async () => {
    const mapTab = await newOfflineTab(browser, "map")
    let styleBlocked = true
    await mapTab.page.route(/openfreemap\.org\/styles\//, (route) => (styleBlocked ? route.abort() : route.continue()))
    const mapFailures = await mapTab.openFailing("/solo")
    await mapFailures.expectMapFailure()
    styleBlocked = false
    await mapFailures.retryMap()
    await PracticeRoundPage.whenShown(mapTab)
  })

  await test.step("outlines that will not load say so, and Try again loads them", async () => {
    const outlinesTab = await newOfflineTab(browser, "outlines")
    let outlinesBlocked = true
    await outlinesTab.page.route(/outlines\.json$/, (route) => (outlinesBlocked ? route.abort() : route.continue()))
    const outlineFailures = await outlinesTab.openFailing("/score-review")
    await outlineFailures.expectOutlinesFailure()
    outlinesBlocked = false
    await outlineFailures.retryOutlines()
    await ScoreReviewPage.whenShown(outlinesTab)
  })

  await test.step("VR that will not load says so, leaves no canvas, and Try again opens the session", async () => {
    const vrTab = await newOfflineTab(browser, "vr")
    const headset = await Headset.install(vrTab.page)
    let landBlocked = true
    await vrTab.page.route(/land\.json$/, (route) => (landBlocked ? route.abort() : route.continue()))
    await vrTab.openPractice()
    const vrFailures = new LoadFailures(vrTab.page)
    const canvases = await vrFailures.canvases()
    await vrFailures.pressVr()
    await vrFailures.expectVrFailure()
    await vrFailures.expectNoCanvasLeftBehind(canvases)
    landBlocked = false
    await vrFailures.retryVr()
    await headset.expectInSession(60_000)
  })

  await test.step("VR code that will not load offers a reload, since trying again cannot work", async () => {
    const vrCodeTab = await newOfflineTab(browser, "vr code")
    await Headset.install(vrCodeTab.page)
    await vrCodeTab.page.route(/\/src\/vr\/index\.ts/, (route) => route.abort())
    await vrCodeTab.openPractice()
    const vrCodeFailures = new LoadFailures(vrCodeTab.page)
    await vrCodeFailures.pressVr()
    await vrCodeFailures.expectVrOffersReload()
  })
})
