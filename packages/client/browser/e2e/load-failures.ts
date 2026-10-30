// The map, the outlines and VR failing to load, against the Vite dev
// server: the player is told, and Try again loads them once they can be
// fetched. VR runs on an emulated headset (see pages/Headset.ts).
// Usage, from packages/client: node browser/e2e/load-failures.ts [outDir]
import { Headset } from "../pages/Headset.ts"
import { PracticeRoundPage } from "../pages/PracticeRoundPage.ts"
import { until } from "../pages/support.ts"
import { ScoreReviewPage } from "../pages/ScoreReviewPage.ts"
import { LoadFailures } from "../pages/LoadFailures.ts"
import { Checks, launchChrome, newTab } from "./support.ts"

const checks = new Checks()
const browser = await launchChrome()

const mapTab = await newTab(browser, "map")
let styleBlocked = true
await mapTab.page.route(/openfreemap\.org\/styles\//, (r) => (styleBlocked ? r.abort() : r.continue()))
const mapFailures = await mapTab.openFailing("/solo")
checks.check(await mapFailures.mapFailureShown(), "a map style that will not load says so")
styleBlocked = false
await mapFailures.retryMap()
await PracticeRoundPage.whenShown(mapTab)
checks.check(true, "Try again then loads the map")

const outlinesTab = await newTab(browser, "outlines")
let outlinesBlocked = true
await outlinesTab.page.route(/regions\.json$/, (r) => (outlinesBlocked ? r.abort() : r.continue()))
const outlineFailures = await outlinesTab.openFailing("/score-review")
checks.check(await outlineFailures.outlinesFailureShown(), "outlines that will not load say so")
outlinesBlocked = false
await outlineFailures.retryOutlines()
await ScoreReviewPage.whenShown(outlinesTab)
checks.check(true, "Try again then loads the outlines")

const vrTab = await newTab(browser, "vr")
const headset = await Headset.install(vrTab.page)
let landBlocked = true
await vrTab.page.route(/land\.json$/, (r) => (landBlocked ? r.abort() : r.continue()))
await vrTab.openPractice()
const vrFailures = new LoadFailures(vrTab.page)
const canvases = await vrFailures.canvases()
await vrFailures.pressVr()
checks.check(await vrFailures.vrFailureShown(), "VR that will not load says so")
const left = await vrFailures.canvases()
checks.check(left === canvases, `and leaves no canvas behind (${canvases} before, ${left} after)`)
landBlocked = false
await vrFailures.retryVr()
await until(
  "the headset session",
  () => headset.inSession(),
  (on) => on,
  60_000
)
checks.check(true, "Try again then opens the headset session")

const vrCodeTab = await newTab(browser, "vr code")
await Headset.install(vrCodeTab.page)
await vrCodeTab.page.route(/\/src\/vr\/index\.ts/, (r) => r.abort())
await vrCodeTab.openPractice()
const vrCodeFailures = new LoadFailures(vrCodeTab.page)
await vrCodeFailures.pressVr()
checks.check(
  (await vrCodeFailures.vrFailureShown()) && (await vrCodeFailures.vrOffersReload()),
  "VR code that will not load offers a reload, since trying again cannot work"
)

await browser.close()
checks.finish()
