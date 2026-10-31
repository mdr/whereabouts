// Practice in VR, on an emulated Quest 3 (see pages/Headset.ts): the VR
// button opens a headset session, spraying the globe with the trigger puts
// paint on the round, and the round still submits and scores. Saves
// screenshots of the headset's view.
import { test } from "@playwright/test"
import { Quaternion, Vector3 } from "three"
import { Headset } from "../pages/Headset.ts"
import { soloTestIds } from "../../src/screens/SoloTestIds.ts"
import { flagRevealTestIds } from "../../src/ui/FlagRevealTestIds.ts"
import { hintTestIds } from "../../src/ui/HintTestIds.ts"
import { questionCardTestIds } from "../../src/ui/QuestionCardTestIds.ts"
import { vrButtonTestIds } from "../../src/ui/VrButtonTestIds.ts"
import { until } from "../pages/support.ts"
import { Tool } from "../../src/tool.ts"
import { PictureBack } from "../../src/vr/picture-back.ts"
import { VrViewType } from "../../src/vr/view.ts"
import { WristButton } from "../../src/vr/wrist-button.ts"
import { Hand } from "../../src/vr/hand.ts"
import { check, newTab, shot } from "./support.ts"

test("vr", async ({ browser }) => {
  const tab = await newTab(browser, "vr", {
    context: { viewport: { width: 1200, height: 800 } }
  })
  const headset = await Headset.install(tab.page)

  const round = await tab.openPractice()
  const button = tab.page.getByTestId(vrButtonTestIds.button)
  check(await button.isVisible(), "a headset browser offers VR")
  const pressed = Date.now()
  await button.click()
  await until(
    "the headset session",
    () => headset.inSession(),
    (on) => on,
    60_000
  )
  check(
    (await button.innerText()).includes("In VR"),
    `the VR button opens a headset session, loading for ${((Date.now() - pressed) / 1000).toFixed(1)} s`
  )
  await round.pause(1500)
  await round.screenshot(shot(`vr-1-entered.png`))
  const startMenu = await headset.menu()
  check(
    startMenu.heading.startsWith("QUESTION 1 OF") && startMenu.more.map((m) => m.label).join() === "Home",
    `the menu heads the question and offers Home (${startMenu.heading}; ${startMenu.more.map((m) => m.label).join()})`
  )
  check(!(await headset.globeBordersShown()), "the globe shows no borders when the page's map would not")

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
  const droplets = await spray(shot(`vr-2-spraying.png`))
  check(droplets > 20, `spraying throws droplets (${droplets} in the air)`)
  const after = await round.map.yourPaintCells()
  check(after > before, `spraying the globe paints the round (${before} -> ${after} cells)`)
  const shown = await until(
    "the globe to show the paint",
    () => headset.globePaintCells(),
    (n) => n === after
  )
  check(shown === after, `the globe shows it (${shown} cells)`)
  check(await headset.toolsHeld(), "while painting, the hands hold the can and eraser")
  const around = await headset.surroundings()
  check(around.space && !around.passthrough, "space shows round the globe")
  const moon = await headset.moon()
  check(
    moon !== undefined && Math.abs(moon.distance - 7.54) < 0.01 && Math.abs(moon.radius - 0.2727) < 0.001,
    `with the moon to the globe's scale (${moon?.distance.toFixed(1)} and ${moon?.radius.toFixed(3)} of its radius)`
  )
  check(!(await headset.controllersShown()), "while painting, the controllers themselves are hidden")
  await round.pause(300)
  await round.screenshot(shot(`vr-3-sprayed.png`))

  // The left hand holds an eraser: its trigger rubs paint out where the right
  // hand painted. Undo puts it back.
  await headset.pointRight(can, centre)
  await round.pause(300)
  const painted = (await headset.target(Hand.RIGHT))!
  await headset.point(Hand.LEFT, [can[0] - 0.3, can[1], can[2]], painted)
  await round.pause(300)
  await headset.trigger(Hand.LEFT, 1)
  await round.pause(1500)
  await headset.trigger(Hand.LEFT, 0)
  await round.pause(300)
  const erased = await round.map.yourPaintCells()
  check(erased < after, `the left hand erases (${after} -> ${erased} cells)`)
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
    Hand.LEFT,
    painted.map((c, i) => c - (toward[i]! / length) * -0.04) as [number, number, number],
    painted
  )
  await round.pause(1500)
  await headset.point(Hand.LEFT, rubFrom, painted)
  await round.pause(300)
  const rubbed = await headset.paintMass()
  check(
    rubbed < unrubbed * 0.995,
    `rubbing the eraser on the globe rubs paint out (${unrubbed.toFixed(1)} -> ${rubbed.toFixed(1)} in all)`
  )
  await round.paintTools.undoWithKeyboard()
  await until(
    "the rubbing undone",
    () => round.map.yourPaintCells(),
    (n) => n === after
  )
  // Gripping, to turn or zoom the globe, it rubs nothing out.
  const ungripped = await headset.paintMass()
  await headset.grip(Hand.LEFT, 1)
  await headset.point(
    Hand.LEFT,
    painted.map((c, i) => c - (toward[i]! / length) * -0.04) as [number, number, number],
    painted
  )
  await round.pause(1500)
  await headset.point(Hand.LEFT, rubFrom, painted)
  // Held still before letting go: a release straight after the move would
  // fling the globe if no frame came between, and leave it spinning.
  await headset.frames(5)
  await headset.grip(Hand.LEFT, 0)
  await round.pause(300)
  const gripped = await headset.paintMass()
  check(
    gripped === ungripped,
    `gripping the globe, the eraser rubs nothing out (${ungripped.toFixed(1)} -> ${gripped.toFixed(1)})`
  )

  // Turning the left palm up opens the wrist menu; the right hand's
  // ray presses its buttons.
  const leftHand: [number, number, number] = [can[0] - 0.3, can[1], can[2]]
  check(!(await headset.wristOpen()), "the wrist menu stays shut while the left hand points ahead")
  // A quarter turn about the ray brings the left palm (its grip's +X) round to face up.
  await headset.hold(Hand.LEFT, leftHand, [0, 0, Math.SQRT1_2, Math.SQRT1_2])
  check(
    await until(
      "the wrist menu",
      () => headset.wristOpen(),
      (open) => open
    ),
    "turning the left palm up opens the wrist menu"
  )
  await round.pause(800)
  const press = async (id: Parameters<typeof headset.wristButton>[0]) => {
    await headset.press(can, await headset.wristButton(id))
  }
  await round.screenshot(shot(`vr-wrist.png`))
  const undone = async (what: string) => {
    await round.paintTools.undoWithKeyboard()
    await until(
      what,
      () => round.map.yourPaintCells(),
      (n) => n === after
    )
  }
  await press(WristButton.CLEAR)
  check((await round.map.yourPaintCells()) === 0, "its Clear clears the paint, and the press sprays none")
  await undone("the clear undone")
  await press(WristButton.LATITUDE)
  check(
    await until(
      "the hint band",
      () => headset.hintShown(),
      (on) => on
    ),
    "its Latitude button gives the hint, shaded on the globe"
  )
  check(await tab.page.getByTestId(hintTestIds.band).isVisible(), "and on the page")
  await press(WristButton.TRIM_HINT)
  const trimmed = await round.map.yourPaintCells()
  check(trimmed <= after, `Trim to hint keeps only the paint in the band (${after} -> ${trimmed} cells)`)
  if (trimmed < after) await undone("the trim undone")
  await headset.point(Hand.LEFT, leftHand, centre)
  check(
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
  await until(
    "the first spray undone",
    () => round.map.yourPaintCells(),
    (n) => n === 0
  )
  await headset.pointRight([centre[0] + 0.2, centre[1], centre[2] + 0.1], centre)
  await round.pause(200)
  // The globe turns between frames that both see the grip held: hold each
  // pose for a few frames.
  await headset.rightGrip(1)
  await headset.frames(5)
  for (let i = 1; i <= 10; i++) {
    await headset.pointRight([centre[0] + 0.2 - 0.03 * i, centre[1], centre[2] + 0.1], centre)
    await headset.frames(3)
  }
  await headset.frames(5)
  await headset.rightGrip(0)
  await round.pause(1000)
  await round.screenshot(shot(`vr-4-spun.png`))
  await spray()
  const second = await round.map.yourPaintCellIds()
  const shared = second.filter((c) => first.has(c)).length
  check(
    second.length > 0 && shared < second.length / 5,
    `spinning the globe moves where paint lands (${shared} of ${second.length} cells shared)`
  )

  // Zoom in with the thumbstick: the page's map comes in over the globe for detail.
  check(!(await headset.globeDetailShown()), "the whole globe shows no map over it")
  await headset.rightStick(0, -1)
  await round.pause(1800)
  await headset.rightStick(0, 0)
  const detailed = await until(
    "the map over the zoomed globe",
    () => headset.globeDetailShown(),
    (on) => on,
    30_000
  )
  check(detailed, "zooming in brings the map over the globe")
  const gap = await headset.panelGap()
  check(gap > -0.005, `the panels stay clear of the zoomed globe (gap ${gap.toFixed(3)} rad)`)
  await round.pause(500)
  await round.screenshot(shot(`vr-5-zoomed.png`))
  await headset.pointRight(can, centre)
  await round.pause(500)
  await round.screenshot(shot(`vr-6-zoomed-aim.png`))

  // Submit with the menu's button, pointing and pulling the trigger: the
  // headset stays on and shows the answer, and Next brings the next round to it.
  check((await headset.doneLabel()) === "Submit", "with paint down, the menu offers Submit")
  /** Points at the menu's Done and pulls the trigger. */
  async function pressDone(): Promise<void> {
    await headset.press(can, await headset.menuButton("done"))
  }
  await pressDone()
  // Not PracticeRevealPage.whenShown: the page's map, which it waits on, draws nothing while VR shows.
  const scoreText = tab.page.getByTestId(soloTestIds.roundScore)
  await scoreText.waitFor()
  const score = Number(await scoreText.innerText())
  check(score >= 0 && score <= 1000, `the sprayed round scores ${score}`)
  const revealed = await until(
    "the answer in VR",
    () => headset.view(),
    (v) => v === VrViewType.REVEAL
  )
  check((await headset.inSession()) && revealed === VrViewType.REVEAL, "submitting shows the answer in VR")
  const vrFact = await until(
    "the line about the answer",
    () => headset.fact(),
    (f) => f !== undefined
  )
  check((vrFact ?? "").length > 20, `with a line about it (${vrFact})`)
  const postcard = await until(
    "the answer's photo",
    () => headset.postcard(),
    (p) => p !== undefined
  )
  check(postcard !== undefined, `the answer's photo shows, its postcard back from ${postcard}`)
  check(!(await headset.toolsHeld()), "the hands put the can and eraser away for the answer")
  check(
    await until(
      "the controllers",
      () => headset.controllersShown(),
      (on) => on
    ),
    "and the controllers show again"
  )
  check(
    await until(
      "the globe in colour",
      () => headset.globeColourShown(),
      (on) => on,
      30_000
    ),
    "the answer shows the land in natural colour"
  )
  check(await headset.globeBordersShown(), "and the borders, as the page's reveal does")
  const table = await headset.scoreTable()
  check(
    table?.rows.length === 1 && table.rows[0]!.total === String(score),
    `a score table beside the globe lists the round (${JSON.stringify(table?.rows)})`
  )
  await round.pause(1000)
  await round.screenshot(shot(`vr-reveal.png`))
  await round.pause(1500)
  await round.screenshot(shot(`vr-8-answer.png`))
  await tab.page.getByTestId(soloTestIds.nextButton).dispatchEvent("click")
  const nextRound = await until(
    "the next round in VR",
    () => headset.view(),
    (v) => v === VrViewType.PAINT
  )
  check((await headset.inSession()) && nextRound === VrViewType.PAINT, "Next brings the next round to VR")
  check(!(await headset.globeColourShown()), "and the plain land back")
  check(
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
    (v) => v === VrViewType.REVEAL
  )
  await scoreText.waitFor()
  const passScore = Number(await scoreText.innerText())
  check(passed === VrViewType.REVEAL && passScore === 250, `passing in VR scores ${passScore}`)
  check((await headset.scoreTable())?.rows.length === 2, "the score table lists both rounds")
  await round.screenshot(shot(`vr-10-passed.png`))
  await tab.page.evaluate(() => window.whereaboutsVr.exit())
  await until(
    "the session to end",
    () => headset.inSession(),
    (on) => !on
  )
  check(true, "Leave VR leaves it")
  const drawnOnLeaving = await headset.scenesDrawn()
  await round.pause(500)
  const drawnSince = (await headset.scenesDrawn()) - drawnOnLeaving
  check(drawnSince === 0, `and the VR scene is no longer drawn on the page (${drawnSince} frames in 0.5 s)`)

  // A flag round shows its flag over the VR menu, a card in the flag's own shape.
  await tab.page.context().close()
  const flagTab = await newTab(browser, "vr-flag", {
    context: { viewport: { width: 1200, height: 800 } },
    initScript: () => {
      localStorage.setItem("wa.practiceTypes", "FLAG")
      // The Political map, where a country round offers the fill tool.
      localStorage.setItem("wa.mapDetail", "POLITICAL")
      // As if loading outlasted the press: the browser would refuse it the headset.
      Object.defineProperty(UserActivation.prototype, "isActive", { get: () => false })
    }
  })
  const flagHeadset = await Headset.install(flagTab.page)
  const flagRound = await flagTab.openPractice()
  await flagTab.page.getByTestId(vrButtonTestIds.button).click()
  check(await flagTab.page.getByTestId(vrButtonTestIds.loading).isVisible(), "loading VR covers the screen")
  const enterVr = flagTab.page.getByTestId(vrButtonTestIds.enterButton)
  await enterVr.waitFor({ timeout: 60_000 })
  check(!(await flagHeadset.inSession()), "once the press has gone stale, VR waits to be asked again")
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
  const flagRatio = Number(
    await flagTab.page
      .getByTestId(questionCardTestIds.flag)
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--flag-ratio"))
  )
  check(
    flag !== undefined && Math.abs(flag[0] / flag[1] / flagRatio - 1) < 0.01,
    `a flag round shows the flag in VR in its own shape (${flag?.map((m) => m.toFixed(2)).join(" × ")} m, ratio ${flagRatio})`
  )
  await flagRound.pause(1500)
  await flagRound.screenshot(shot(`vr-7-flag.png`))

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
  check(held.held && moved > 0.2, `gripping the flag takes it in hand (moved ${moved.toFixed(2)} m)`)
  await flagRound.screenshot(shot(`vr-9-held.png`))
  // Turning the hand tilts it, as a card held up would.
  const handDir = (to: [number, number, number]) => to.map((c, i) => c - [hand[0] + 0.1, hand[1], hand[2]][i]!)
  const angle = (a: number[], b: number[]) =>
    Math.acos(a.reduce((s, x, i) => s + x * b[i]!, 0) / Math.hypot(...a) / Math.hypot(...b))
  const tiltedTo: [number, number, number] = [hand[0] + 0.1, home[1] - 0.5, home[2]]
  await flagHeadset.pointRight([hand[0] + 0.1, hand[1], hand[2]], tiltedTo)
  await flagRound.pause(800)
  const tilted = await flagHeadset.pictureHeld()
  // The hand's own turn, as Headset.point() aims it, carries the picture's facing with it.
  const aim = (to: [number, number, number]) =>
    new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), new Vector3(...handDir(to)).normalize())
  const expected = new Vector3(...held.facing).applyQuaternion(aim(tiltedTo).multiply(aim(home).invert()))
  const astray = angle(expected.toArray(), tilted.facing)
  check(
    astray < 0.05,
    `and turns with the hand (${angle(held.facing, tilted.facing).toFixed(2)} rad, ${astray.toFixed(3)} off the hand's turn)`
  )
  await flagRound.screenshot(shot(`vr-9b-tilted.png`))
  // Turned right round, it shows its back: the flag's reverse.
  const grip: [number, number, number] = [hand[0] + 0.1, hand[1], hand[2]]
  const awayTo = grip.map((c, i) => 2 * c - home[i]!) as [number, number, number]
  await flagHeadset.pointRight(grip, awayTo)
  await flagRound.pause(800)
  const turned = await flagHeadset.pictureHeld()
  const turnedBy = angle(held.facing, turned.facing)
  check(
    turned.held && turnedBy > 2.5 && turned.back === PictureBack.REVERSE,
    `turned round, it shows the flag's reverse (${turnedBy.toFixed(2)} rad)`
  )
  await flagRound.screenshot(shot(`vr-9c-back.png`))
  await flagHeadset.rightGrip(0)
  await flagRound.pause(500)
  const back = await flagHeadset.pictureHeld()
  const off = Math.hypot(...back.at.map((c, i) => c - home[i]!))
  check(!back.held && off < 0.01, `letting go puts it back (${off.toFixed(3)} m off)`)

  // It says how to answer; A brings out the fill pail, whose pull fills the
  // country it points at, and a second pull takes the fill off.
  const mode = (await flagHeadset.menu()).mode
  check(mode?.startsWith("Paint ") === true, `a flag round says how to answer it (${mode})`)
  await flagHeadset.button(Hand.RIGHT, "a-button")
  await flagHeadset.button(Hand.RIGHT, "a-button")
  check((await flagHeadset.toolInHand())[Hand.RIGHT] === Tool.FILL, "A twice brings out the fill pail")
  const [fx, fy, fz] = await flagHeadset.eyes()
  const fillFrom: [number, number, number] = [fx + 0.15, fy - 0.25, fz - 0.15]
  // Up and right of the globe's middle, at the prime meridian and the equator: the Sahel.
  const sahel: [number, number, number] = [fx + 0.06, fy - 0.3 + 0.05, fz - 0.67 + 0.2]
  const pull = async () => {
    await flagHeadset.pointRight(fillFrom, sahel)
    await flagHeadset.frames(3)
    await flagHeadset.rightTrigger(1)
    await flagHeadset.frames(3)
    await flagHeadset.rightTrigger(0)
    await flagHeadset.frames(3)
  }
  await pull()
  const filled = await until(
    "the filled country",
    () => flagRound.map.yourPaintCells(),
    (n) => n > 0
  )
  check(filled > 0, `a pull fills the country it points at (${filled} cells)`)
  await flagRound.screenshot(shot(`vr-9d-filled.png`))
  await pull()
  check(
    (await until(
      "the fill taken off",
      () => flagRound.map.yourPaintCells(),
      (n) => n === 0
    )) === 0,
    "and a second pull takes it off"
  )
  await flagHeadset.button(Hand.RIGHT, "a-button")
  check((await flagHeadset.toolInHand())[Hand.RIGHT] === Tool.PAINT, "A again goes back to the spray can")

  // Pass the flag round: its reveal offers every country's flag, in VR and on the page.
  const flagCan: [number, number, number] = [hand[0], hand[1], hand[2]]
  /** Points at a menu button of the flag round's headset and pulls the trigger. */
  async function flagPress(id: string): Promise<void> {
    await flagHeadset.press(flagCan, await flagHeadset.menuButton(id))
  }
  await flagPress("done")
  await until(
    "the flag round's answer",
    () => flagHeadset.view(),
    (v) => v === VrViewType.REVEAL
  )
  await flagPress("flags")
  const pins = await until(
    "the flags on the globe",
    () => flagHeadset.flagPins(),
    (n) => n > 190,
    30_000
  )
  check(pins > 190, `Show all flags pins every country's flag on the globe (${pins})`)
  check(
    await until(
      "the rays",
      () => flagHeadset.beamsShown(),
      (on) => on
    ),
    "rays from the hands show what they point at"
  )
  const pagePins = await flagTab.page.getByTestId(flagRevealTestIds.pin).count()
  check(pagePins > 190, `and on the page's map (${pagePins})`)
  await flagRound.pause(1500)
  await flagRound.screenshot(shot(`vr-11-all-flags.png`))

  // Pointing at a flag enlarges it and names its country.
  const facing = (await flagHeadset.flagFacing())!
  await flagHeadset.pointRight(flagCan, facing.at)
  // The other hand may rest on some flag already: wait for this one.
  const named = await until(
    "the flag's name",
    () => flagHeadset.flagNamed(),
    (n) => n === facing.name
  )
  check(named === facing.name, `pointing at a flag names its country (${named})`)
  const outlined = await flagHeadset.flagOutlined()
  check(
    outlined?.name === named && (outlined?.segments ?? 0) >= 3,
    `and picks out its border (${outlined?.segments} segments)`
  )
  await flagRound.pause(500)
  await flagRound.screenshot(shot(`vr-11b-flag-named.png`))

  // And with the whole globe in view.
  await flagHeadset.rightStick(0, 1)
  await flagRound.pause(3000)
  await flagHeadset.rightStick(0, 0)
  const wide = await flagHeadset.globeScale()
  const wideFacing = (await flagHeadset.flagFacing())!
  await flagHeadset.pointRight(flagCan, wideFacing.at)
  const wideOutlined = await until(
    "the border, zoomed out",
    () => flagHeadset.flagOutlined(),
    (o) => o?.name === wideFacing.name
  )
  check(
    wide === 1 && (wideOutlined?.segments ?? 0) >= 3,
    `zoomed right out, it still picks out the border (${wideOutlined?.name}, ${wide.toFixed(1)} times)`
  )
  await flagRound.pause(500)
  await flagRound.screenshot(shot(`vr-11b-border-zoomed-out.png`))

  // Zoomed right in, to a city's width, the flags still show.
  await flagHeadset.rightStick(0, -1)
  await flagRound.pause(6000)
  await flagHeadset.rightStick(0, 0)
  const deep = await flagHeadset.globeScale()
  check(deep >= 150, `the globe zooms in to a city's width (${deep.toFixed(0)} times)`)
  const zoomedPins = await flagHeadset.flagPins()
  check(zoomedPins > 190, `with the flags still shown (${zoomedPins})`)
  await flagRound.pause(1500)
  await flagRound.screenshot(shot(`vr-11c-flags-zoomed.png`))
  await flagPress("flags")
  check(
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
    (s) => !s.space && s.passthrough && s.on && s.view === VrViewType.REVEAL,
    30_000
  )
  check(
    !room.space && room.passthrough && room.on && room.view === VrViewType.REVEAL,
    "See your room swaps space for passthrough, the answer still showing"
  )
  check((await flagHeadset.moon()) === undefined, "and the moon goes with space")
  await flagRound.pause(1500)
  await flagRound.screenshot(shot(`vr-11d-passthrough.png`))

  // VR from the home screen, staying on into practice.
  await flagTab.page.context().close()
  const homeTab = await newTab(browser, "vr-home", {
    context: { viewport: { width: 1200, height: 800 } }
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
    (v) => v === VrViewType.LOBBY
  )
  const offered = (await homeHeadset.menu()).actions.map((a) => a.label).join(", ")
  check(homeView === VrViewType.LOBBY && offered === "Practise, Change topic", `the home screen opens VR (${offered})`)
  await homePage.pause(1500)
  await homePage.screenshot(shot(`vr-12-home.png`))
  const [hx, hy, hz] = await homeHeadset.eyes()
  await homeHeadset.press([hx + 0.15, hy - 0.25, hz - 0.15], await homeHeadset.menuButton("act0"))
  const practising = await until(
    "practice in VR",
    () => homeHeadset.view(),
    (v) => v === VrViewType.PAINT,
    30_000
  )
  check(
    practising === VrViewType.PAINT && (await homeHeadset.inSession()),
    "Practise in VR starts practice, the headset still on"
  )
})
