// The map, the outlines and VR failing to load, against the Vite dev
// server: the player is told, and Try again loads them once they can be
// fetched. VR runs on an emulated headset (see pages/headset/Headset.ts).
import { test } from "../coverage/coverage-test.ts"
import { ClientErrorKind } from "@whereabouts/shared/protocol/client-error"
import { Download } from "../pages/Download.ts"
import { PracticeRoundPage } from "../pages/PracticeRoundPage.ts"
import { ScoreReviewPage } from "../pages/ScoreReviewPage.ts"
import { newOfflineTab } from "./iwft-tab.ts"
import { closeAllTabs } from "./vr/vr-support.ts"

test.afterEach(async ({ browser }) => closeAllTabs(browser))

test("load-failures", async ({ browser }) => {
  await test.step("a map that will not load says so and is reported to the server, and Try again loads it", async () => {
    const mapTab = await newOfflineTab(browser, "map")
    await mapTab.failDownload(Download.MAP_STYLE)
    const mapFailures = await mapTab.openFailing("/solo")
    await mapFailures.expectMapFailure()
    await mapTab.expectClientErrorReported(ClientErrorKind.MAP_LOAD)
    mapTab.allowDownload(Download.MAP_STYLE)
    await mapFailures.retryMap()
    await PracticeRoundPage.whenShown(mapTab)
  })

  await test.step("outlines that will not load say so, and Try again loads them", async () => {
    const outlinesTab = await newOfflineTab(browser, "outlines")
    await outlinesTab.failDownload(Download.OUTLINES)
    const outlineFailures = await outlinesTab.openFailing("/score-review")
    await outlineFailures.expectOutlinesFailure()
    outlinesTab.allowDownload(Download.OUTLINES)
    await outlineFailures.retryOutlines()
    await ScoreReviewPage.whenShown(outlinesTab)
  })

  await test.step("VR that will not load says so, leaves no canvas, and Try again opens the session", async () => {
    const vrTab = await newOfflineTab(browser, "vr")
    const headset = await vrTab.installHeadset()
    await vrTab.failDownload(Download.LAND_MASK)
    await vrTab.openPractice()
    const vrFailures = vrTab.loadFailures()
    const canvases = await vrFailures.canvases()
    await vrFailures.pressVr()
    await vrFailures.expectVrFailure()
    await vrFailures.expectNoCanvasLeftBehind(canvases)
    vrTab.allowDownload(Download.LAND_MASK)
    await vrFailures.retryVr()
    await headset.expectEnteredAfterPress(60_000)
  })

  await test.step("VR code that will not load offers a reload, since trying again cannot work", async () => {
    const vrCodeTab = await newOfflineTab(browser, "vr code")
    await vrCodeTab.installHeadset()
    await vrCodeTab.failDownload(Download.VR_CODE)
    await vrCodeTab.openPractice()
    const vrCodeFailures = vrCodeTab.loadFailures()
    await vrCodeFailures.pressVr()
    await vrCodeFailures.expectVrOffersReload()
  })
})
