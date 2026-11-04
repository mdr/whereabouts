// Touch on the map in practice mode, against the Vite dev server: one finger
// paints; two fingers pan and zoom and leave no paint behind.
import { test } from "../coverage/coverage-test.ts"
import { newOfflineTab } from "./iwft-tab.ts"
import { shot } from "./support.ts"

test("touch", async ({ browser }) => {
  const tab = await newOfflineTab(browser, "touch", {
    context: { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true }
  })

  const practiceRoundPage = await tab.openPractice()
  await practiceRoundPage.map.fingerDrag({ across: 0.49, down: 0.52 })
  await practiceRoundPage.map.expectYourPaintCells({ greaterThan: 0 })
  await practiceRoundPage.screenshot(shot(`touch-1-painted.png`))

  await practiceRoundPage.paintTools.clear()
  await practiceRoundPage.map.expectYourPaintCells({ exactly: 0 })
  await practiceRoundPage.map.pinchOut({ across: 0.49, down: 0.52 })
  // A pinch paints nothing.
  await practiceRoundPage.map.expectYourPaintCells({ exactly: 0 })
  await practiceRoundPage.screenshot(shot(`touch-2-pinched.png`))
})
