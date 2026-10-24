// Practice mode against the Vite dev server: take a hint, paint two blobs,
// undo and redo the second with the keyboard, trim to the hint and undo it,
// paint on the globe but not the space around it, submit, and see a score.
// Saves screenshots.
// Usage, from packages/client: node browser/e2e/solo.ts [outDir]
import { Checks, launchChrome, newTab, outDir } from "./support.ts"

const out = outDir()
const checks = new Checks()
const browser = await launchChrome()
const tab = await newTab(browser, "solo", { context: { viewport: { width: 1400, height: 900 } }, dev: true })

const practiceRoundPage = await tab.openPractice()
await practiceRoundPage.screenshot(`${out}/1-start.png`)
const band = await practiceRoundPage.useHint("longitude")
checks.check(/^Between [\d.]+°[EW]? and [\d.]+°[EW]?$/.test(band), `practice gives a hint: ${band}`)
const shapes = await practiceRoundPage.map.shownHintShapes()
checks.check(shapes === 1 || shapes === 2, `the band is shaded on the map (${shapes})`)

await practiceRoundPage.map.drag({ across: 0.5, down: 0.45 }, { distancePx: 120, steps: 20 })
await practiceRoundPage.map.dab({ across: 0.7, down: 0.54 })
const twoBlobs = await practiceRoundPage.map.yourPaintCells()
await practiceRoundPage.screenshot(`${out}/2-painted.png`)

await practiceRoundPage.paintTools.undoWithKeyboard()
const oneBlob = await practiceRoundPage.map.yourPaintCells()
await practiceRoundPage.paintTools.redoWithKeyboard()
const back = await practiceRoundPage.map.yourPaintCells()
checks.check(oneBlob < twoBlobs && back === twoBlobs, `undo then redo: ${twoBlobs} -> ${oneBlob} -> ${back} cells`)

// Trim to hint drops whatever paint is outside the band; undo brings it back.
await practiceRoundPage.paintTools.trimToHint()
const trimmed = await practiceRoundPage.map.yourPaintCells()
await practiceRoundPage.screenshot(`${out}/2b-trimmed-to-hint.png`)
await practiceRoundPage.paintTools.undoWithKeyboard()
const untrimmed = await practiceRoundPage.map.yourPaintCells()
checks.check(
  trimmed <= back && untrimmed === back,
  `trim to hint, then undo: ${back} -> ${trimmed} -> ${untrimmed} cells`
)

await practiceRoundPage.map.toggleGlobe()
checks.check(await practiceRoundPage.map.showsGlobe(), "the globe button shows the globe")
await practiceRoundPage.map.dab({ across: 0.98, down: 0.5 })
const afterSpace = await practiceRoundPage.map.yourPaintCells()
await practiceRoundPage.map.dab({ across: 0.4, down: 0.5 })
const afterGlobe = await practiceRoundPage.map.yourPaintCells()
await practiceRoundPage.screenshot(`${out}/2c-globe.png`)
checks.check(
  afterSpace === untrimmed && afterGlobe > afterSpace,
  `a dab beside the globe paints nothing, one on it paints: ${untrimmed} -> ${afterSpace} -> ${afterGlobe} cells`
)
await practiceRoundPage.map.toggleGlobe()
checks.check(!(await practiceRoundPage.map.showsGlobe()), "and the button goes back to the flat map")
console.log("blobs:", await practiceRoundPage.devDrawer.blobs())

const practiceRevealPage = await practiceRoundPage.submit()
const score = await practiceRevealPage.score()
checks.check(/^-?\d+$/.test(score), `a score on the reveal (${score})`)
const fact = await practiceRevealPage.fact()
checks.check(fact.length > 20, `and a line about the answer (${fact})`)
await practiceRevealPage.map.hover({ across: 0.55, down: 0.4 })
await practiceRevealPage.screenshot(`${out}/3-reveal.png`)

await browser.close()
checks.finish()
