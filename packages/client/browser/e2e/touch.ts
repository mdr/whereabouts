// Touch on the map in practice mode, against the Vite dev server: one finger
// paints; two fingers pan and zoom and leave no paint behind.
// Usage, from packages/client: node browser/e2e/touch.ts [outDir]
import { Checks, launchChrome, newTab, outDir } from "./support.ts"

const out = outDir()
const checks = new Checks()
const browser = await launchChrome()
const tab = await newTab(browser, "touch", {
  context: { viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: true }
})

const practiceRoundPage = await tab.openPractice()
await practiceRoundPage.map.fingerDrag({ across: 0.49, down: 0.52 })
const afterOneFinger = await practiceRoundPage.map.yourPaintCells()
checks.check(afterOneFinger > 0, `one finger paints (${afterOneFinger} cells)`)
await practiceRoundPage.screenshot(`${out}/touch-1-painted.png`)

await practiceRoundPage.paintTools.clear()
await practiceRoundPage.map.pinchOut({ across: 0.49, down: 0.52 })
const afterPinch = await practiceRoundPage.map.yourPaintCells()
checks.check(afterPinch === 0, `a pinch paints nothing (${afterPinch} cells)`)
await practiceRoundPage.screenshot(`${out}/touch-2-pinched.png`)

await browser.close()
checks.finish()
