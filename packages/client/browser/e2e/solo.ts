// Practice mode against the Vite dev server: paint two blobs, undo and redo
// the second with the keyboard, submit, and see a score. Saves screenshots.
// Usage, from packages/client: node browser/e2e/solo.ts [outDir]
import { Checks, launchChrome, newTab, outDir } from "./support.ts"

const out = outDir()
const checks = new Checks()
const browser = await launchChrome()
const tab = await newTab(browser, "solo", { context: { viewport: { width: 1400, height: 900 } }, dev: true })

const practiceRoundPage = await tab.openPractice()
await practiceRoundPage.screenshot(`${out}/1-start.png`)

await practiceRoundPage.map.drag({ across: 0.5, down: 0.45 }, { distancePx: 120, steps: 20 })
await practiceRoundPage.map.dab({ across: 0.7, down: 0.54 })
const twoBlobs = await practiceRoundPage.map.yourPaintCells()
await practiceRoundPage.screenshot(`${out}/2-painted.png`)

await practiceRoundPage.paintTools.undoWithKeyboard()
const oneBlob = await practiceRoundPage.map.yourPaintCells()
await practiceRoundPage.paintTools.redoWithKeyboard()
const back = await practiceRoundPage.map.yourPaintCells()
checks.check(oneBlob < twoBlobs && back === twoBlobs, `undo then redo: ${twoBlobs} -> ${oneBlob} -> ${back} cells`)
console.log("blobs:", await practiceRoundPage.devDrawer.blobs())

const practiceRevealPage = await practiceRoundPage.submit()
const score = await practiceRevealPage.score()
checks.check(/^-?\d+$/.test(score), `a score on the reveal (${score})`)
await practiceRevealPage.map.hover({ across: 0.55, down: 0.4 })
await practiceRevealPage.screenshot(`${out}/3-reveal.png`)

await browser.close()
checks.finish()
