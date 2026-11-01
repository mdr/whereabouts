// Practice mode against the Vite dev server: take a hint, paint two blobs,
// undo and redo the second with the keyboard, pan with Space and press a
// button with it, trim to the hint and undo it,
// paint on the globe but not the space around it, submit, and see a score.
// Saves screenshots.
import { test } from "@playwright/test"
import { Tool } from "../../src/paint/tool.ts"
import { HintAxis } from "@whereabouts/shared/hints"
import { newTab, shot } from "./support.ts"

test("solo", async ({ browser }) => {
  const tab = await newTab(browser, "solo", { context: { viewport: { width: 1400, height: 900 } }, dev: true })

  const practiceRoundPage = await test.step("a practice round gives a hint", async () => {
    const practiceRoundPage = await tab.openPractice()
    await practiceRoundPage.screenshot(shot(`1-start.png`))
    await practiceRoundPage.useHint(HintAxis.LONGITUDE)
    await practiceRoundPage.expectHintBand(HintAxis.LONGITUDE)
    // Two shapes when the band crosses 180°.
    await practiceRoundPage.map.expectHintShapes({ atLeast: 1, atMost: 2 })
    return practiceRoundPage
  })

  const back = await test.step("paint two blobs, undo and redo the second", async () => {
    await practiceRoundPage.map.drag({ across: 0.5, down: 0.45 }, { distance: 120, steps: 20 })
    await practiceRoundPage.map.dab({ across: 0.7, down: 0.54 })
    await practiceRoundPage.map.expectYourPaintCells({ greaterThan: 0 })
    const twoBlobs = await practiceRoundPage.map.yourPaintCells()
    await practiceRoundPage.screenshot(shot(`2-painted.png`))

    await practiceRoundPage.paintTools.undoWithKeyboard()
    await practiceRoundPage.map.expectYourPaintCells({ lessThan: twoBlobs })
    await practiceRoundPage.paintTools.redoWithKeyboard()
    await practiceRoundPage.map.expectYourPaintCells({ exactly: twoBlobs })
    return twoBlobs
  })

  await test.step("Space and Enter on a Tabbed-to button", async () => {
    // Space presses a button the player Tabbed to, but pans with a clicked
    // tool button focused.
    await practiceRoundPage.paintTools.selectTool(Tool.PAN)
    await practiceRoundPage.paintTools.tabOnAndPress("Space")
    await practiceRoundPage.paintTools.expectSelectedTool(Tool.PAINT)
    await practiceRoundPage.paintTools.selectTool(Tool.PAINT)
    await practiceRoundPage.map.dragHoldingSpace({ across: 0.3, down: 0.6 })
    // A drag holding Space paints nothing.
    await practiceRoundPage.map.expectYourPaintCells({ exactly: back })
    // Enter submits the round, but not while the player has Tabbed to a button.
    await practiceRoundPage.paintTools.selectTool(Tool.PAN)
    await practiceRoundPage.paintTools.tabOnAndPress("Enter")
    await practiceRoundPage.paintTools.expectSelectedTool(Tool.PAINT)
    await practiceRoundPage.expectNotSubmitted()
  })

  // Trim to hint drops whatever paint is outside the band; undo brings it back.
  await test.step("trim to hint, then undo", async () => {
    // Measured as paint, not cells: the trim splits a cell across the band's edge into finer ones.
    const before = await practiceRoundPage.map.yourPaintMass()
    await practiceRoundPage.paintTools.trimToHint()
    await practiceRoundPage.map.expectYourPaintMass({ atMost: before })
    await practiceRoundPage.screenshot(shot(`2b-trimmed-to-hint.png`))
    await practiceRoundPage.paintTools.undoWithKeyboard()
    await practiceRoundPage.map.expectYourPaintMass({ exactly: before })
  })

  await test.step("paint on the globe but not the space around it", async () => {
    await practiceRoundPage.map.toggleGlobe()
    await practiceRoundPage.map.expectGlobe(true)
    await practiceRoundPage.map.dab({ across: 0.98, down: 0.5 })
    // A dab beside the globe paints nothing.
    await practiceRoundPage.map.expectYourPaintCells({ exactly: back })
    await practiceRoundPage.map.dab({ across: 0.4, down: 0.5 })
    await practiceRoundPage.map.expectYourPaintCells({ greaterThan: back })
    await practiceRoundPage.screenshot(shot(`2c-globe.png`))
    await practiceRoundPage.map.toggleGlobe()
    await practiceRoundPage.map.expectGlobe(false)
    console.log("blobs:", await practiceRoundPage.devDrawer.blobs())
  })

  // The globe button, just clicked, has focus; Enter still submits.
  await test.step("submit and see a score", async () => {
    const practiceRevealPage = await practiceRoundPage.submitWithKeyboard()
    await practiceRevealPage.expectScoreIsInteger()
    await practiceRevealPage.expectFactLine()
    await practiceRevealPage.expectPhoto()
    await practiceRevealPage.map.hover({ across: 0.55, down: 0.4 })
    await practiceRevealPage.screenshot(shot(`3-reveal.png`))
  })
})
