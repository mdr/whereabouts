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
/** A short stroke from the same spot each time, across the middle of the globe; returns the droplets in the air. */
async function spray(screenshot?: string): Promise<number> {
  await headset.pointRight(can, centre)
  await round.pause(300)
  await headset.rightTrigger(1)
  for (let i = 0; i < 10; i++) {
    await headset.pointRight(can, [centre[0] + 0.01 * i, centre[1], centre[2]])
    await round.pause(100)
  }
  if (screenshot) await round.screenshot(screenshot)
  const droplets = await headset.particles()
  await headset.rightTrigger(0)
  return droplets
}

const before = await round.map.yourPaintCells()
const droplets = await spray(`${out}/vr-2-spraying.png`)
checks.check(droplets > 20, `spraying throws droplets (${droplets} in the air)`)
const after = await round.map.yourPaintCells()
checks.check(after > before, `spraying the globe paints the round (${before} -> ${after} cells)`)
const shown = await until(
  "the globe to show the paint",
  () => headset.globePaintCells(),
  (n) => n === after
)
checks.check(shown === after, `the globe shows it (${shown} cells)`)
checks.check(await headset.toolsHeld(), "while painting, the hands hold the can and eraser")
const around = await headset.surroundings()
checks.check(around.space && !around.passthrough, "space shows round the globe")
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

// Rubbing the eraser on the globe rubs out too, with no trigger. The grip,
// and so the eraser, sits behind the ray's origin and angled down from it:
// the ray starts inside the globe for the tip to reach the surface.
const rubFrom: [number, number, number] = [can[0] - 0.3, can[1], can[2]]
const unrubbed = await headset.paintMass()
const toward = painted.map((c, i) => c - rubFrom[i]!)
const length = Math.hypot(...toward)
await headset.point(
  "left",
  painted.map((c, i) => c - (toward[i]! / length) * -0.04) as [number, number, number],
  painted
)
await round.pause(1500)
await headset.point("left", rubFrom, painted)
await round.pause(300)
const rubbed = await headset.paintMass()
checks.check(
  rubbed < unrubbed * 0.995,
  `rubbing the eraser on the globe rubs paint out (${unrubbed.toFixed(1)} -> ${rubbed.toFixed(1)} in all)`
)
await round.paintTools.undoWithKeyboard()
await until(
  "the rubbing undone",
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
const gap = await headset.panelGap()
checks.check(gap > -0.005, `the panels stay clear of the zoomed globe (gap ${gap.toFixed(3)} rad)`)
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
checks.check(!(await headset.toolsHeld()), "the hands put the can and eraser away for the answer")
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

// Pass the flag round: its reveal offers every country's flag, in VR and on the page.
const flagCan: [number, number, number] = [hand[0], hand[1], hand[2]]
/** Points at a menu button of the flag round's headset and pulls the trigger. */
async function flagPress(id: string): Promise<void> {
  await flagHeadset.pointRight(flagCan, await flagHeadset.menuButton(id))
  await flagRound.pause(500)
  await flagHeadset.trigger("right", 1)
  await flagRound.pause(300)
  await flagHeadset.trigger("right", 0)
  await flagRound.pause(300)
}
await flagPress("done")
await until(
  "the flag round's answer",
  () => flagHeadset.view(),
  (v) => v === "reveal"
)
await flagPress("flags")
const pins = await until(
  "the flags on the globe",
  () => flagHeadset.flagPins(),
  (n) => n > 190,
  30_000
)
checks.check(pins > 190, `Show all flags pins every country's flag on the globe (${pins})`)
const pagePins = await flagTab.page.locator(".flag-pin").count()
checks.check(pagePins > 190, `and on the page's map (${pagePins})`)
await flagRound.pause(1500)
await flagRound.screenshot(`${out}/vr-11-all-flags.png`)

// Pointing at a flag enlarges it and names its country.
const facing = (await flagHeadset.flagFacing())!
await flagHeadset.pointRight(flagCan, facing.at)
const named = await until(
  "the flag's name",
  () => flagHeadset.flagNamed(),
  (n) => n !== undefined
)
checks.check(named === facing.name, `pointing at a flag names its country (${named})`)
await flagRound.pause(500)
await flagRound.screenshot(`${out}/vr-11b-flag-named.png`)

// Zoomed right in, to a city's width, the flags still show.
await flagHeadset.rightStick(0, -1)
await flagRound.pause(4000)
await flagHeadset.rightStick(0, 0)
const deep = await flagHeadset.globeScale()
checks.check(deep >= 150, `the globe zooms in to a city's width (${deep.toFixed(0)} times)`)
const zoomedPins = await flagHeadset.flagPins()
checks.check(zoomedPins > 190, `with the flags still shown (${zoomedPins})`)
await flagRound.pause(1500)
await flagRound.screenshot(`${out}/vr-11c-flags-zoomed.png`)
await flagPress("flags")
checks.check(
  (await until(
    "the flags off the globe",
    () => flagHeadset.flagPins(),
    (n) => n === 0
  )) === 0,
  "Hide all flags takes them off"
)

// See your room swaps space for passthrough, in a new session, still on the answer.
await flagPress("passthrough")
const room = await until(
  "passthrough",
  async () => ({
    ...(await flagHeadset.surroundings()),
    on: await flagHeadset.inSession(),
    view: await flagHeadset.view()
  }),
  (s) => !s.space && s.passthrough && s.on && s.view === "reveal",
  30_000
)
checks.check(
  !room.space && room.passthrough && room.on && room.view === "reveal",
  "See your room swaps space for passthrough, the answer still showing"
)
await flagRound.pause(1500)
await flagRound.screenshot(`${out}/vr-11d-passthrough.png`)

// VR from the home screen, staying on into practice.
await flagTab.page.context().close()
const homeTab = await newTab(browser, "vr-home", {
  context: { viewport: { width: 1200, height: 800 } },
  baseUrl: process.argv[3]
})
const homeHeadset = await Headset.install(homeTab.page)
const homePage = await homeTab.openHome()
await homeTab.page.getByTestId(vrButtonTestIds.button).click()
await until(
  "the home screen's headset session",
  () => homeHeadset.inSession(),
  (on) => on,
  60_000
)
const homeView = await until(
  "the menu in VR",
  () => homeHeadset.view(),
  (v) => v === "lobby"
)
const offered = (await homeHeadset.menu()).actions.map((a) => a.label).join(", ")
checks.check(homeView === "lobby" && offered === "Practise, Change topic", `the home screen opens VR (${offered})`)
await homePage.pause(1500)
await homePage.screenshot(`${out}/vr-12-home.png`)
const [hx, hy, hz] = await homeHeadset.eyes()
await homeHeadset.pointRight([hx + 0.15, hy - 0.25, hz - 0.15], await homeHeadset.menuButton("act0"))
await homePage.pause(500)
await homeHeadset.trigger("right", 1)
await homePage.pause(300)
await homeHeadset.trigger("right", 0)
const practising = await until(
  "practice in VR",
  () => homeHeadset.view(),
  (v) => v === "paint",
  30_000
)
checks.check(
  practising === "paint" && (await homeHeadset.inSession()),
  "Practise in VR starts practice, the headset still on"
)

await browser.close()
checks.finish()
