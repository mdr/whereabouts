// Practice mode against the Vite dev server: take a hint, paint two blobs,
// undo and redo the second with the keyboard, pan with Space and press a
// button with it, trim to the hint and undo it,
// paint on the globe but not the space around it, submit, and see a score.
// Saves screenshots.
import { test } from "@playwright/test"
import { Tool } from "../../src/paint/tool.ts"
import { HintAxis } from "@whereabouts/shared/hints"
import { check, newTab, shot } from "./support.ts"

test("solo", async ({ browser }) => {
  const tab = await newTab(browser, "solo", { context: { viewport: { width: 1400, height: 900 } }, dev: true })

  const practiceRoundPage = await test.step("a practice round gives a hint", async () => {
    const practiceRoundPage = await tab.openPractice()
    await practiceRoundPage.screenshot(shot(`1-start.png`))
    const band = await practiceRoundPage.useHint(HintAxis.LONGITUDE)
    check(/^Between [\d.]+°[EW]? and [\d.]+°[EW]?$/.test(band), `practice gives a hint: ${band}`)
    const shapes = await practiceRoundPage.map.shownHintShapes()
    check(shapes === 1 || shapes === 2, `the band is shaded on the map (${shapes})`)
    return practiceRoundPage
  })

  const back = await test.step("paint two blobs, undo and redo the second", async () => {
    await practiceRoundPage.map.drag({ across: 0.5, down: 0.45 }, { distance: 120, steps: 20 })
    await practiceRoundPage.map.dab({ across: 0.7, down: 0.54 })
    const twoBlobs = await practiceRoundPage.map.yourPaintCells()
    await practiceRoundPage.screenshot(shot(`2-painted.png`))

    await practiceRoundPage.paintTools.undoWithKeyboard()
    const oneBlob = await practiceRoundPage.map.yourPaintCells()
    await practiceRoundPage.paintTools.redoWithKeyboard()
    const back = await practiceRoundPage.map.yourPaintCells()
    check(oneBlob < twoBlobs && back === twoBlobs, `undo then redo: ${twoBlobs} -> ${oneBlob} -> ${back} cells`)
    return back
  })

  await test.step("Space and Enter on a Tabbed-to button", async () => {
    // Space presses a button the player Tabbed to, but pans with a clicked
    // tool button focused.
    await practiceRoundPage.paintTools.selectTool(Tool.PAN)
    await practiceRoundPage.paintTools.tabOnAndPress("Space")
    const tabbedTo = await practiceRoundPage.paintTools.selectedTool()
    check(tabbedTo === Tool.PAINT, `Space presses the tool button Tabbed to (${tabbedTo})`)
    await practiceRoundPage.paintTools.selectTool(Tool.PAINT)
    await practiceRoundPage.map.dragHoldingSpace({ across: 0.3, down: 0.6 })
    const afterSpaceDrag = await practiceRoundPage.map.yourPaintCells()
    check(afterSpaceDrag === back, `a drag holding Space paints nothing: ${back} -> ${afterSpaceDrag} cells`)
    // Enter submits the round, but not while the player has Tabbed to a button.
    await practiceRoundPage.paintTools.selectTool(Tool.PAN)
    await practiceRoundPage.paintTools.tabOnAndPress("Enter")
    const enteredOn = await practiceRoundPage.paintTools.selectedTool()
    const stillPainting = await practiceRoundPage.paintTools.toolIsUsable(Tool.PAINT)
    check(
      enteredOn === Tool.PAINT && stillPainting,
      `Enter presses the tool button Tabbed to, and does not submit (${enteredOn}, painting: ${stillPainting})`
    )
  })

  // Trim to hint drops whatever paint is outside the band; undo brings it back.
  await test.step("trim to hint, then undo", async () => {
    // Measured as paint, not cells: the trim splits a cell across the band's edge into finer ones.
    const before = await practiceRoundPage.map.yourPaintMass()
    await practiceRoundPage.paintTools.trimToHint()
    const trimmed = await practiceRoundPage.map.yourPaintMass()
    await practiceRoundPage.screenshot(shot(`2b-trimmed-to-hint.png`))
    await practiceRoundPage.paintTools.undoWithKeyboard()
    const untrimmed = await practiceRoundPage.map.yourPaintMass()
    const km2 = (squareKm: number) => `${Math.round(squareKm).toLocaleString()} km²`
    check(
      trimmed <= before && untrimmed === before,
      `trim to hint, then undo: ${km2(before)} -> ${km2(trimmed)} -> ${km2(untrimmed)}`
    )
  })

  await test.step("paint on the globe but not the space around it", async () => {
    await practiceRoundPage.map.toggleGlobe()
    check(await practiceRoundPage.map.showsGlobe(), "the globe button shows the globe")
    await practiceRoundPage.map.dab({ across: 0.98, down: 0.5 })
    const afterSpace = await practiceRoundPage.map.yourPaintCells()
    await practiceRoundPage.map.dab({ across: 0.4, down: 0.5 })
    const afterGlobe = await practiceRoundPage.map.yourPaintCells()
    await practiceRoundPage.screenshot(shot(`2c-globe.png`))
    check(
      afterSpace === back && afterGlobe > afterSpace,
      `a dab beside the globe paints nothing, one on it paints: ${back} -> ${afterSpace} -> ${afterGlobe} cells`
    )
    await practiceRoundPage.map.toggleGlobe()
    check(!(await practiceRoundPage.map.showsGlobe()), "and the button goes back to the flat map")
    console.log("blobs:", await practiceRoundPage.devDrawer.blobs())
  })

  // The globe button, just clicked, has focus; Enter still submits.
  await test.step("submit and see a score", async () => {
    const practiceRevealPage = await practiceRoundPage.submitWithKeyboard()
    const score = await practiceRevealPage.score()
    check(/^-?\d+$/.test(score), `a score on the reveal (${score})`)
    const fact = await practiceRevealPage.fact()
    check(fact.length > 20, `and a line about the answer (${fact})`)
    check(await practiceRevealPage.hasPhoto(), "and a photo of it")
    await practiceRevealPage.map.hover({ across: 0.55, down: 0.4 })
    await practiceRevealPage.screenshot(shot(`3-reveal.png`))
  })
})
