// Painting the globe in VR, on an emulated Quest 3 (see pages/headset/Headset.ts).
// Saves screenshots of the headset's view.
import { test } from "@playwright/test"
import { HintAxis } from "@whereabouts/shared/hints"
import { Hand } from "../../../src/vr/hands/hand.ts"
import { WristButton } from "../../../src/vr/wrist/wrist-button.ts"
import { holdUntil } from "../../pages/support.ts"
import { shot } from "../support.ts"
import { vrPractice, vrPracticePainted } from "./vr-states.ts"
import { closeAllTabs, spray } from "./vr-support.ts"
import type { Vec3 } from "../../../src/vr/probe.ts"

test.afterEach(async ({ browser }) => closeAllTabs(browser))

test("spraying paints the globe, the left hand's eraser rubs paint out, and undo puts it back", async ({ browser }) => {
  const { headset, round, centre, can } = await vrPractice(browser, "vr-spray")
  const before = await round.map.yourPaintCells()
  await spray(headset, round, { centre, can }, { screenshot: shot(`vr-2-spraying.png`), expectDroplets: true })
  await round.map.expectYourPaintCells({ greaterThan: before })
  const after = await round.map.yourPaintCells()
  await headset.scene.expectGlobePaintCells({ exactly: after })
  await headset.scene.expectToolsHeld(true)
  await headset.scene.expectSpaceShown()
  await headset.scene.expectMoon({ distance: 7.54, radius: 0.2727 }, { distance: 0.01, radius: 0.001 })
  await headset.scene.expectControllersShown(false)
  await headset.settle()
  await round.screenshot(shot(`vr-3-sprayed.png`))

  // The left hand holds an eraser: its trigger rubs paint out where the right
  // hand painted. Undo puts it back.
  await headset.controllers.pointRight(can, centre)
  const painted = await headset.aimedAt(Hand.RIGHT)
  await headset.controllers.point(Hand.LEFT, [can[0] - 0.3, can[1], can[2]], painted)
  await headset.aimedAt(Hand.LEFT)
  await holdUntil(
    () => headset.controllers.trigger(Hand.LEFT, 1),
    () => round.map.expectYourPaintCells({ lessThan: after }),
    () => headset.controllers.trigger(Hand.LEFT, 0)
  )
  // A frame must see the release for the stroke to end, so that undo takes it back whole.
  await headset.frames(3)
  await round.paintTools.undoWithKeyboard()
  await round.map.expectYourPaintCells({ exactly: after })

  // Rubbing the eraser on the globe rubs out too, with no trigger. The grip,
  // and so the eraser, sits behind the ray's origin and angled down from it:
  // the ray starts inside the globe for the tip to reach the surface.
  const rubFrom: Vec3 = [can[0] - 0.3, can[1], can[2]]
  const unrubbed = await headset.scene.paintMass()
  const toward = painted.map((component, i) => component - rubFrom[i]!)
  const length = Math.hypot(...toward)
  const rubTip = painted.map((component, i) => component - (toward[i]! / length) * -0.04) as Vec3
  await headset.controllers.point(Hand.LEFT, rubTip, painted)
  await headset.frames(5)
  await headset.controllers.point(Hand.LEFT, rubFrom, painted)
  await headset.scene.expectPaintMass({ lessThan: unrubbed * 0.995 })
  await round.paintTools.undoWithKeyboard()
  await round.map.expectYourPaintCells({ exactly: after })
  // Gripping, to turn or zoom the globe, it rubs nothing out.
  const ungripped = await headset.scene.paintMass()
  await headset.controllers.grip(Hand.LEFT, 1)
  await headset.controllers.point(Hand.LEFT, rubTip, painted)
  await headset.frames(5)
  await headset.controllers.point(Hand.LEFT, rubFrom, painted)
  await headset.scene.expectPaintMassStays(ungripped, 1_500)
  // Held still before letting go: a release straight after the move would
  // fling the globe if no frame came between, and leave it spinning.
  await headset.frames(5)
  await headset.controllers.grip(Hand.LEFT, 0)
  await headset.settle()
  await headset.scene.expectPaintMass({ exactly: ungripped })
})

test("turning the left palm up opens the wrist menu, whose buttons clear, hint and trim", async ({ browser }) => {
  const { headset, round, centre, can, painted } = await vrPracticePainted(browser, "vr-wrist")
  // Turning the left palm up opens the wrist menu; the right hand's
  // ray presses its buttons.
  const leftHand: Vec3 = [can[0] - 0.3, can[1], can[2]]
  await headset.controllers.point(Hand.LEFT, leftHand, centre)
  await headset.aimedAt(Hand.LEFT)
  await headset.panels.expectWristStaysShut()
  // A quarter turn about the ray brings the left palm (its grip's +X) round to face up.
  await headset.controllers.hold(Hand.LEFT, leftHand, [0, 0, Math.SQRT1_2, Math.SQRT1_2])
  await headset.panels.expectWristOpen(true)
  await headset.settle()
  const press = async (id: WristButton): Promise<void> => {
    await headset.controllers.press(can, await headset.panels.wristButton(id))
  }
  await round.screenshot(shot(`vr-wrist.png`))
  const undone = async (): Promise<void> => {
    await round.paintTools.undoWithKeyboard()
    await round.map.expectYourPaintCells({ exactly: painted })
  }
  await press(WristButton.CLEAR)
  await round.map.expectYourPaintCells({ exactly: 0 })
  await undone()
  await press(WristButton.LATITUDE)
  await headset.scene.expectHintShown(true)
  await round.expectHintBand(HintAxis.LATITUDE)
  await press(WristButton.TRIM_HINT)
  await round.map.expectYourPaintCells({ atMost: painted })
  if ((await round.map.yourPaintCells()) < painted) await undone()
  await headset.controllers.point(Hand.LEFT, leftHand, centre)
  await headset.panels.expectWristOpen(false)
})

test("gripping turns the globe, and the thumbstick zooms in until the map shows over it", async ({ browser }) => {
  const { headset, round, centre, can } = await vrPracticePainted(browser, "vr-globe")
  // Grab the globe by its right side and sweep the hand left: the same spray
  // then lands somewhere else.
  const first = await round.map.yourPaintCellIds()
  await round.paintTools.undoWithKeyboard()
  await round.map.expectYourPaintCells({ exactly: 0 })
  await headset.controllers.pointRight([centre[0] + 0.2, centre[1], centre[2] + 0.1], centre)
  await headset.frames(3)
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
  await headset.settle()
  await round.screenshot(shot(`vr-4-spun.png`))
  await spray(headset, round, { centre, can })
  await round.map.expectPaintMovedFrom(first)

  // Zoom in with the thumbstick: the page's map comes in over the globe for detail.
  await headset.scene.expectNoGlobeDetailFor()
  await headset.zoomInUntilMapShows()
  await headset.settle()
  await headset.scene.expectPanelGap({ greaterThan: -0.005 })
  await round.screenshot(shot(`vr-5-zoomed.png`))
  await headset.controllers.pointRight(can, centre)
  await headset.settle()
  await round.screenshot(shot(`vr-6-zoomed-aim.png`))
})
