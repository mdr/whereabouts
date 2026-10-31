// Touch on the map in practice mode, against the Vite dev server: one finger
// paints; two fingers pan and zoom and leave no paint behind.
import { test } from "@playwright/test"
import { check, newTab, shot } from "./support.ts"

test("touch", async ({ browser }) => {
  const tab = await newTab(browser, "touch", {
    context: { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true }
  })

  const practiceRoundPage = await tab.openPractice()
  await practiceRoundPage.map.fingerDrag({ across: 0.49, down: 0.52 })
  const afterOneFinger = await practiceRoundPage.map.yourPaintCells()
  check(afterOneFinger > 0, `one finger paints (${afterOneFinger} cells)`)
  await practiceRoundPage.screenshot(shot(`touch-1-painted.png`))

  await practiceRoundPage.paintTools.clear()
  await practiceRoundPage.map.pinchOut({ across: 0.49, down: 0.52 })
  const afterPinch = await practiceRoundPage.map.yourPaintCells()
  check(afterPinch === 0, `a pinch paints nothing (${afterPinch} cells)`)
  await practiceRoundPage.screenshot(shot(`touch-2-pinched.png`))
})
