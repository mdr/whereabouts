// The map, the outlines and VR failing to load, against the Vite dev
// server: the player is told, and Try again loads them once they can be
// fetched. VR runs on an emulated headset (see pages/headset/Headset.ts).
import { test } from "@playwright/test"
import { Headset } from "../pages/headset/Headset.ts"
import { PracticeRoundPage } from "../pages/PracticeRoundPage.ts"
import { until } from "../pages/support.ts"
import { ScoreReviewPage } from "../pages/ScoreReviewPage.ts"
import { LoadFailures } from "../pages/LoadFailures.ts"
import { check, newTab } from "./support.ts"

test("load-failures", async ({ browser }) => {
  const mapTab = await newTab(browser, "map")
  let styleBlocked = true
  await mapTab.page.route(/openfreemap\.org\/styles\//, (route) => (styleBlocked ? route.abort() : route.continue()))
  const mapFailures = await mapTab.openFailing("/solo")
  check(await mapFailures.mapFailureShown(), "a map style that will not load says so")
  styleBlocked = false
  await mapFailures.retryMap()
  await PracticeRoundPage.whenShown(mapTab)
  check(true, "Try again then loads the map")

  const outlinesTab = await newTab(browser, "outlines")
  let outlinesBlocked = true
  await outlinesTab.page.route(/outlines\.json$/, (route) => (outlinesBlocked ? route.abort() : route.continue()))
  const outlineFailures = await outlinesTab.openFailing("/score-review")
  check(await outlineFailures.outlinesFailureShown(), "outlines that will not load say so")
  outlinesBlocked = false
  await outlineFailures.retryOutlines()
  await ScoreReviewPage.whenShown(outlinesTab)
  check(true, "Try again then loads the outlines")

  const vrTab = await newTab(browser, "vr")
  const headset = await Headset.install(vrTab.page)
  let landBlocked = true
  await vrTab.page.route(/land\.json$/, (route) => (landBlocked ? route.abort() : route.continue()))
  await vrTab.openPractice()
  const vrFailures = new LoadFailures(vrTab.page)
  const canvases = await vrFailures.canvases()
  await vrFailures.pressVr()
  check(await vrFailures.vrFailureShown(), "VR that will not load says so")
  const left = await vrFailures.canvases()
  check(left === canvases, `and leaves no canvas behind (${canvases} before, ${left} after)`)
  landBlocked = false
  await vrFailures.retryVr()
  await until(
    "the headset session",
    () => headset.inSession(),
    (on) => on,
    60_000
  )
  check(true, "Try again then opens the headset session")

  const vrCodeTab = await newTab(browser, "vr code")
  await Headset.install(vrCodeTab.page)
  await vrCodeTab.page.route(/\/src\/vr\/index\.ts/, (route) => route.abort())
  await vrCodeTab.openPractice()
  const vrCodeFailures = new LoadFailures(vrCodeTab.page)
  await vrCodeFailures.pressVr()
  check(
    (await vrCodeFailures.vrFailureShown()) && (await vrCodeFailures.vrOffersReload()),
    "VR code that will not load offers a reload, since trying again cannot work"
  )
})
