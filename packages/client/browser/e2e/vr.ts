// Practice in VR, on an emulated Quest 3 (see pages/Headset.ts): the VR
// button opens a headset session, spraying the globe with the trigger puts
// paint on the round, and the round still submits and scores. Saves
// screenshots of the headset's view.
// Usage, from packages/client: node browser/e2e/vr.ts [outDir] [baseUrl]
import { Headset } from "../pages/Headset.ts"
import { soloTestIds } from "../../src/screens/SoloTestIds.ts"
import { hintTestIds } from "../../src/ui/HintTestIds.ts"
import { vrButtonTestIds } from "../../src/ui/VrButtonTestIds.ts"
import { until } from "../pages/support.ts"
import { Checks, launchChrome, newTab, outDir } from "./support.ts"

const out = outDir()
const checks = new Checks()
const browser = await launchChrome()
const tab = await newTab(browser, "vr", {
  context: { viewport: { width: 1200, height: 800 } },
  baseUrl: process.argv[3]
})
const headset = await Headset.install(tab.page)

const round = await tab.openPractice()
const button = tab.page.getByTestId(vrButtonTestIds.button)
checks.check(await button.isVisible(), "a headset browser offers VR")
const pressed = Date.now()
await button.click()
await until(
  "the headset session",
  () => headset.inSession(),
  (on) => on,
  60_000
)
checks.check(
  (await button.innerText()).includes("In VR"),
  `the VR button opens a headset session, loading for ${((Date.now() - pressed) / 1000).toFixed(1)} s`
)
await round.pause(1500)
await round.screenshot(`${out}/vr-1-entered.png`)
checks.check(!(await headset.globeBordersShown()), "the globe shows no borders when the page's map would not")

// The globe starts 45 cm ahead of the eyes and 30 cm below them, its near
// side there, 22 cm in radius.
const [x, y, z] = await headset.eyes()
const centre: [number, number, number] = [x, y - 0.3, z - 0.67]
const can: [number, number, number] = [x + 0.15, y - 0.25, z - 0.15]
/** A short stroke from the same spot each time, across the middle of the globe. */
async function spray(screenshot?: string): Promise<void> {
  await headset.pointRight(can, centre)
  await round.pause(300)
  await headset.rightTrigger(1)
  for (let i = 0; i < 10; i++) {
    await headset.pointRight(can, [centre[0] + 0.01 * i, centre[1], centre[2]])
    await round.pause(100)
  }
  if (screenshot) await round.screenshot(screenshot)
  await headset.rightTrigger(0)
}

const before = await round.map.yourPaintCells()
await spray(`${out}/vr-2-spraying.png`)
const after = await round.map.yourPaintCells()
checks.check(after > before, `spraying the globe paints the round (${before} -> ${after} cells)`)
const shown = await until(
  "the globe to show the paint",
  () => headset.globePaintCells(),
  (n) => n === after
)
checks.check(shown === after, `the globe shows it (${shown} cells)`)
await round.pause(300)
await round.screenshot(`${out}/vr-3-sprayed.png`)

// The left hand holds an eraser: its trigger rubs paint out where the right
// hand painted. Undo puts it back.
await headset.pointRight(can, centre)
await round.pause(300)
const painted = (await headset.target("right"))!
await headset.point("left", [can[0] - 0.3, can[1], can[2]], painted)
await round.pause(300)
await headset.trigger("left", 1)
await round.pause(1500)
await headset.trigger("left", 0)
await round.pause(300)
const erased = await round.map.yourPaintCells()
checks.check(erased < after, `the left hand erases (${after} -> ${erased} cells)`)
await round.paintTools.undoWithKeyboard()
await until(
  "the erasing undone",
  () => round.map.yourPaintCells(),
  (n) => n === after
)

// Turning the left palm up opens the wrist menu; the right hand's
// ray presses its buttons.
const leftHand: [number, number, number] = [can[0] - 0.3, can[1], can[2]]
checks.check(!(await headset.wristOpen()), "the wrist menu stays shut while the left hand points ahead")
// A quarter turn about the ray brings the left palm (its grip's +X) round to face up.
await headset.hold("left", leftHand, [0, 0, Math.SQRT1_2, Math.SQRT1_2])
checks.check(
  await until(
    "the wrist menu",
    () => headset.wristOpen(),
    (open) => open
  ),
  "turning the left palm up opens the wrist menu"
)
await round.pause(800)
const press = async (id: Parameters<typeof headset.wristButton>[0]) => {
  await headset.pointRight(can, await headset.wristButton(id))
  await round.pause(400)
  await headset.rightTrigger(1)
  await round.pause(300)
  await headset.rightTrigger(0)
  await round.pause(300)
}
await round.screenshot(`${out}/vr-wrist.png`)
const undone = async (what: string) => {
  await round.paintTools.undoWithKeyboard()
  await until(
    what,
    () => round.map.yourPaintCells(),
    (n) => n === after
  )
}
await press("clear")
checks.check((await round.map.yourPaintCells()) === 0, "its Clear clears the paint, and the press sprays none")
await undone("the clear undone")
await press("latitude")
checks.check(
  await until(
    "the hint band",
    () => headset.hintShown(),
    (on) => on
  ),
  "its Latitude button gives the hint, shaded on the globe"
)
checks.check(await tab.page.getByTestId(hintTestIds.band).isVisible(), "and on the page")
await press("trimHint")
const trimmed = await round.map.yourPaintCells()
checks.check(trimmed <= after, `Trim to hint keeps only the paint in the band (${after} -> ${trimmed} cells)`)
if (trimmed < after) await undone("the trim undone")
await headset.point("left", leftHand, centre)
checks.check(
  !(await until(
    "the wrist menu shut",
    () => headset.wristOpen(),
    (open) => !open
  )),
  "turning the palm away shuts it"
)

// Grab the globe by its right side and sweep the hand left: the same spray
// then lands somewhere else.
const first = new Set(await round.map.yourPaintCellIds())
await round.paintTools.undoWithKeyboard()
await headset.pointRight([centre[0] + 0.2, centre[1], centre[2] + 0.1], centre)
await round.pause(200)
// The globe turns between frames that both see the grip held, and the
// emulator draws few frames a second: hold still at each end long enough
// for several.
await headset.rightGrip(1)
await round.pause(500)
for (let i = 1; i <= 10; i++) {
  await headset.pointRight([centre[0] + 0.2 - 0.03 * i, centre[1], centre[2] + 0.1], centre)
  await round.pause(150)
}
await round.pause(500)
await headset.rightGrip(0)
await round.pause(1000)
await round.screenshot(`${out}/vr-4-spun.png`)
await spray()
const second = await round.map.yourPaintCellIds()
const shared = second.filter((c) => first.has(c)).length
checks.check(
  second.length > 0 && shared < second.length / 5,
  `spinning the globe moves where paint lands (${shared} of ${second.length} cells shared)`
)

// Zoom in with the thumbstick: the page's map comes in over the globe for detail.
checks.check(!(await headset.globeDetailShown()), "the whole globe shows no map over it")
await headset.rightStick(0, -1)
await round.pause(1800)
await headset.rightStick(0, 0)
const detailed = await until(
  "the map over the zoomed globe",
  () => headset.globeDetailShown(),
  (on) => on,
  30_000
)
checks.check(detailed, "zooming in brings the map over the globe")
await round.pause(500)
await round.screenshot(`${out}/vr-5-zoomed.png`)
await headset.pointRight(can, centre)
await round.pause(500)
await round.screenshot(`${out}/vr-6-zoomed-aim.png`)

// Submit with the menu's button, pointing and pulling the trigger: the
// headset stays on and shows the answer, and Next brings the next round to it.
checks.check((await headset.doneLabel()) === "Submit", "with paint down, the menu offers Submit")
/** Points at the menu's Done and pulls the trigger. */
async function pressDone(): Promise<void> {
  await headset.pointRight(can, await headset.menuButton("done"))
  await round.pause(500)
  await headset.rightTrigger(1)
  await round.pause(300)
  await headset.rightTrigger(0)
}
await pressDone()
// Not PracticeRevealPage.whenShown: the page's map, which it waits on, draws nothing while VR shows.
const scoreText = tab.page.getByTestId(soloTestIds.roundScore)
await scoreText.waitFor()
const score = Number(await scoreText.innerText())
checks.check(score >= 0 && score <= 1000, `the sprayed round scores ${score}`)
const revealed = await until(
  "the answer in VR",
  () => headset.view(),
  (v) => v === "reveal"
)
checks.check((await headset.inSession()) && revealed === "reveal", "submitting shows the answer in VR")
checks.check(
  await until(
    "the globe in colour",
    () => headset.globeColourShown(),
    (on) => on,
    30_000
  ),
  "the answer shows the land in natural colour"
)
checks.check(await headset.globeBordersShown(), "and the borders, as the page's reveal does")
const table = await headset.scoreTable()
checks.check(
  table?.rows.length === 1 && table.rows[0]!.total === String(score),
  `a score table beside the globe lists the round (${JSON.stringify(table?.rows)})`
)
await round.pause(1000)
await round.screenshot(`${out}/vr-reveal.png`)
await round.pause(1500)
await round.screenshot(`${out}/vr-8-answer.png`)
await tab.page.getByTestId(soloTestIds.nextButton).dispatchEvent("click")
const nextRound = await until(
  "the next round in VR",
  () => headset.view(),
  (v) => v === "paint"
)
checks.check((await headset.inSession()) && nextRound === "paint", "Next brings the next round to VR")
checks.check(!(await headset.globeColourShown()), "and the plain land back")
checks.check(
  await until(
    "Pass on the menu",
    () => headset.doneLabel(),
    (l) => l === "Pass"
  ).then((l) => l === "Pass"),
  "with nothing painted, the menu offers Pass"
)
await pressDone()
const passed = await until(
  "the passed round's answer in VR",
  () => headset.view(),
  (v) => v === "reveal"
)
await scoreText.waitFor()
const passScore = Number(await scoreText.innerText())
checks.check(passed === "reveal" && passScore === 250, `passing in VR scores ${passScore}`)
checks.check((await headset.scoreTable())?.rows.length === 2, "the score table lists both rounds")
await round.screenshot(`${out}/vr-10-passed.png`)
await tab.page.evaluate(() => window.whereaboutsVr.exit())
await until(
  "the session to end",
  () => headset.inSession(),
  (on) => !on
)
checks.check(true, "Leave VR leaves it")

// A flag round shows its flag over the VR menu, a 4:3 card.
await tab.page.context().close()
const flagTab = await newTab(browser, "vr-flag", {
  context: { viewport: { width: 1200, height: 800 } },
  baseUrl: process.argv[3],
  initScript: () => {
    localStorage.setItem("wa.practicePool", "flags")
    // As if loading outlasted the press: the browser would refuse it the headset.
    Object.defineProperty(UserActivation.prototype, "isActive", { get: () => false })
  }
})
const flagHeadset = await Headset.install(flagTab.page)
const flagRound = await flagTab.openPractice()
await flagTab.page.getByTestId(vrButtonTestIds.button).click()
checks.check(await flagTab.page.getByTestId(vrButtonTestIds.loading).isVisible(), "loading VR covers the screen")
const enterVr = flagTab.page.getByTestId(vrButtonTestIds.enterButton)
await enterVr.waitFor({ timeout: 60_000 })
checks.check(!(await flagHeadset.inSession()), "once the press has gone stale, VR waits to be asked again")
await enterVr.click()
await until(
  "the flag round's headset session",
  () => flagHeadset.inSession(),
  (on) => on,
  60_000
)
const flag = await until(
  "the flag in VR",
  () => flagHeadset.picture(),
  (p) => p !== undefined,
  60_000
)
checks.check(
  flag !== undefined && Math.abs(flag[0] / flag[1] - 4 / 3) < 0.01,
  `a flag round shows the flag in VR (${flag?.map((m) => m.toFixed(2)).join(" × ")} m)`
)
await flagRound.pause(1500)
await flagRound.screenshot(`${out}/vr-7-flag.png`)

// Grip it, pointing at it, to take it in hand; it follows the hand, and
// goes back over the menu when let go.
const home = (await flagHeadset.pictureHeld()).at
const hand: [number, number, number] = [home[0] + 0.25, home[1] - 0.15, home[2] + 0.3]
await flagHeadset.pointRight(hand, home)
await flagRound.pause(300)
await flagHeadset.rightGrip(1)
await flagRound.pause(500)
await flagHeadset.pointRight([hand[0] + 0.1, hand[1], hand[2]], home)
await flagRound.pause(800)
const held = await flagHeadset.pictureHeld()
const moved = Math.hypot(...held.at.map((c, i) => c - home[i]!))
checks.check(held.held && moved > 0.2, `gripping the flag takes it in hand (moved ${moved.toFixed(2)} m)`)
await flagRound.screenshot(`${out}/vr-9-held.png`)
await flagHeadset.rightGrip(0)
await flagRound.pause(500)
const back = await flagHeadset.pictureHeld()
const off = Math.hypot(...back.at.map((c, i) => c - home[i]!))
checks.check(!back.held && off < 0.01, `letting go puts it back (${off.toFixed(3)} m off)`)

await browser.close()
checks.finish()
