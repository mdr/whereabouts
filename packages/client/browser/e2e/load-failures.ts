// The map and the outlines failing to load, against the Vite dev server:
// the player is told, and Try again loads them once they can be fetched.
// Usage, from packages/client: node browser/e2e/load-failures.ts [outDir]
import { PracticeRoundPage } from "../pages/PracticeRoundPage.ts"
import { ScoreReviewPage } from "../pages/ScoreReviewPage.ts"
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

await browser.close()
checks.finish()
