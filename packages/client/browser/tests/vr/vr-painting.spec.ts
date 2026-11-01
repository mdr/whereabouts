// Painting the globe in VR, on an emulated Quest 3 (see pages/headset/Headset.ts).
// Saves screenshots of the headset's view.
import { test } from "@playwright/test"
import { Hand } from "../../../src/vr/hands/hand.ts"
import { WristButton } from "../../../src/vr/wrist/wrist-button.ts"
import { hintTestIds } from "../../../src/ui/round/Hint/HintTestIds.ts"
import { until } from "../../pages/support.ts"
import { check, shot } from "../support.ts"
import { vrPractice, vrPracticePainted } from "./vr-states.ts"
import { closeAllTabs, spray } from "./vr-support.ts"
import type { Vec3 } from "../../../src/vr/probe.ts"

test.afterEach(async ({ browser }) => closeAllTabs(browser))

test("spraying paints the globe, the left hand's eraser rubs paint out, and undo puts it back", async ({ browser }) => {
  const { headset, round, centre, can } = await vrPractice(browser, "vr-spray")
  const before = await round.map.yourPaintCells()
  const droplets = await spray(headset, round, { centre, can }, shot(`vr-2-spraying.png`))
  check(droplets > 20, `spraying throws droplets (${droplets} in the air)`)
  const after = await round.map.yourPaintCells()
  check(after > before, `spraying the globe paints the round (${before} -> ${after} cells)`)
  const shown = await until(
    "the globe to show the paint",
    () => headset.scene.globePaintCells(),
    (count) => count === after
  )
  check(shown === after, `the globe shows it (${shown} cells)`)
  check(await headset.scene.toolsHeld(), "while painting, the hands hold the can and eraser")
  const around = await headset.scene.surroundings()
  check(around.space && !around.passthrough, "space shows round the globe")
  const moon = await headset.scene.moon()
  check(
    moon !== undefined && Math.abs(moon.distance - 7.54) < 0.01 && Math.abs(moon.radius - 0.2727) < 0.001,
    `with the moon to the globe's scale (${moon?.distance.toFixed(1)} and ${moon?.radius.toFixed(3)} of its radius)`
  )
  check(!(await headset.scene.controllersShown()), "while painting, the controllers themselves are hidden")
  await round.pause(300)
  await round.screenshot(shot(`vr-3-sprayed.png`))

  // The left hand holds an eraser: its trigger rubs paint out where the right
  // hand painted. Undo puts it back.
  await headset.controllers.pointRight(can, centre)
  await round.pause(300)
  const painted = (await headset.scene.target(Hand.RIGHT))!
  await headset.controllers.point(Hand.LEFT, [can[0] - 0.3, can[1], can[2]], painted)
  await round.pause(300)
  await headset.controllers.trigger(Hand.LEFT, 1)
  await round.pause(1500)
  await headset.controllers.trigger(Hand.LEFT, 0)
  await round.pause(300)
  const erased = await round.map.yourPaintCells()
  check(erased < after, `the left hand erases (${after} -> ${erased} cells)`)
  await round.paintTools.undoWithKeyboard()
  await until(
    "the erasing undone",
    () => round.map.yourPaintCells(),
    (count) => count === after
  )

  // Rubbing the eraser on the globe rubs out too, with no trigger. The grip,
  // and so the eraser, sits behind the ray's origin and angled down from it:
  // the ray starts inside the globe for the tip to reach the surface.
  const rubFrom: Vec3 = [can[0] - 0.3, can[1], can[2]]
  const unrubbed = await headset.scene.paintMass()
  const toward = painted.map((component, i) => component - rubFrom[i]!)
  const length = Math.hypot(...toward)
  const rubTip = painted.map((component, i) => component - (toward[i]! / length) * -0.04) as Vec3
  await headset.controllers.point(Hand.LEFT, rubTip, painted)
  await round.pause(1500)
  await headset.controllers.point(Hand.LEFT, rubFrom, painted)
  await round.pause(300)
  const rubbed = await headset.scene.paintMass()
  check(
    rubbed < unrubbed * 0.995,
    `rubbing the eraser on the globe rubs paint out (${unrubbed.toFixed(1)} -> ${rubbed.toFixed(1)} in all)`
  )
  await round.paintTools.undoWithKeyboard()
  await until(
    "the rubbing undone",
    () => round.map.yourPaintCells(),
    (count) => count === after
  )
  // Gripping, to turn or zoom the globe, it rubs nothing out.
  const ungripped = await headset.scene.paintMass()
  await headset.controllers.grip(Hand.LEFT, 1)
  await headset.controllers.point(Hand.LEFT, rubTip, painted)
  await round.pause(1500)
  await headset.controllers.point(Hand.LEFT, rubFrom, painted)
  // Held still before letting go: a release straight after the move would
  // fling the globe if no frame came between, and leave it spinning.
  await headset.frames(5)
  await headset.controllers.grip(Hand.LEFT, 0)
  await round.pause(300)
  const gripped = await headset.scene.paintMass()
  check(
    gripped === ungripped,
    `gripping the globe, the eraser rubs nothing out (${ungripped.toFixed(1)} -> ${gripped.toFixed(1)})`
  )
})

test("turning the left palm up opens the wrist menu, whose buttons clear, hint and trim", async ({ browser }) => {
  const { tab, headset, round, centre, can, painted } = await vrPracticePainted(browser, "vr-wrist")
  // Turning the left palm up opens the wrist menu; the right hand's
  // ray presses its buttons.
  const leftHand: Vec3 = [can[0] - 0.3, can[1], can[2]]
  await headset.controllers.point(Hand.LEFT, leftHand, centre)
  check(!(await headset.panels.wristOpen()), "the wrist menu stays shut while the left hand points ahead")
  // A quarter turn about the ray brings the left palm (its grip's +X) round to face up.
  await headset.controllers.hold(Hand.LEFT, leftHand, [0, 0, Math.SQRT1_2, Math.SQRT1_2])
  check(
    await until(
      "the wrist menu",
      () => headset.panels.wristOpen(),
      (open) => open
    ),
    "turning the left palm up opens the wrist menu"
  )
  await round.pause(800)
  const press = async (id: Parameters<typeof headset.panels.wristButton>[0]) => {
    await headset.controllers.press(can, await headset.panels.wristButton(id))
  }
  await round.screenshot(shot(`vr-wrist.png`))
  const undone = async (what: string) => {
    await round.paintTools.undoWithKeyboard()
    await until(
      what,
      () => round.map.yourPaintCells(),
      (count) => count === painted
    )
  }
  await press(WristButton.CLEAR)
  check((await round.map.yourPaintCells()) === 0, "its Clear clears the paint, and the press sprays none")
  await undone("the clear undone")
  await press(WristButton.LATITUDE)
  check(
    await until(
      "the hint band",
      () => headset.scene.hintShown(),
      (on) => on
    ),
    "its Latitude button gives the hint, shaded on the globe"
  )
  check(await tab.page.getByTestId(hintTestIds.band).isVisible(), "and on the page")
  await press(WristButton.TRIM_HINT)
  const trimmed = await round.map.yourPaintCells()
  check(trimmed <= painted, `Trim to hint keeps only the paint in the band (${painted} -> ${trimmed} cells)`)
  if (trimmed < painted) await undone("the trim undone")
  await headset.controllers.point(Hand.LEFT, leftHand, centre)
  check(
    !(await until(
      "the wrist menu shut",
      () => headset.panels.wristOpen(),
      (open) => !open
    )),
    "turning the palm away shuts it"
  )
})

test("gripping turns the globe, and the thumbstick zooms in until the map shows over it", async ({ browser }) => {
  const { headset, round, centre, can } = await vrPracticePainted(browser, "vr-globe")
  // Grab the globe by its right side and sweep the hand left: the same spray
  // then lands somewhere else.
  const first = new Set(await round.map.yourPaintCellIds())
  await round.paintTools.undoWithKeyboard()
  await until(
    "the first spray undone",
    () => round.map.yourPaintCells(),
    (count) => count === 0
  )
  await headset.controllers.pointRight([centre[0] + 0.2, centre[1], centre[2] + 0.1], centre)
  await round.pause(200)
  // The globe turns between frames that both see the grip held: hold each
  // pose for a few frames.
  await headset.controllers.rightGrip(1)
  await headset.frames(5)
  for (let i = 1; i <= 10; i++) {
    await headset.controllers.pointRight([centre[0] + 0.2 - 0.03 * i, centre[1], centre[2] + 0.1], centre)
    await headset.frames(3)
  }
  await headset.frames(5)
  await headset.controllers.rightGrip(0)
  await round.pause(1000)
  await round.screenshot(shot(`vr-4-spun.png`))
  await spray(headset, round, { centre, can })
  const second = await round.map.yourPaintCellIds()
  const shared = second.filter((cell) => first.has(cell)).length
  check(
    second.length > 0 && shared < second.length / 5,
    `spinning the globe moves where paint lands (${shared} of ${second.length} cells shared)`
  )

  // Zoom in with the thumbstick: the page's map comes in over the globe for detail.
  check(!(await headset.scene.globeDetailShown()), "the whole globe shows no map over it")
  await headset.controllers.rightStick(0, -1)
  await round.pause(1800)
  await headset.controllers.rightStick(0, 0)
  const detailed = await until(
    "the map over the zoomed globe",
    () => headset.scene.globeDetailShown(),
    (on) => on,
    30_000
  )
  check(detailed, "zooming in brings the map over the globe")
  const gap = await headset.scene.panelGap()
  check(gap > -0.005, `the panels stay clear of the zoomed globe (gap ${gap.toFixed(3)} rad)`)
  await round.pause(500)
  await round.screenshot(shot(`vr-5-zoomed.png`))
  await headset.controllers.pointRight(can, centre)
  await round.pause(500)
  await round.screenshot(shot(`vr-6-zoomed-aim.png`))
})
