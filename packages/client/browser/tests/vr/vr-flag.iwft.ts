// Flag rounds in VR, on an emulated Quest 3 (see pages/headset/Headset.ts).
// Saves screenshots of the headset's view.
import { test } from "../../coverage/coverage-test.ts"
import { Quaternion, Vector3 } from "three"
import { Tool } from "../../../src/paint/tool.ts"
import { Hand } from "../../../src/vr/hands/hand.ts"
import { PictureBack } from "../../../src/vr/picture/picture-back.ts"
import { shot } from "../support.ts"
import { vrFlagAnswer, vrFlagRound } from "./vr-states.ts"
import { closeAllTabs, pressMenu } from "./vr-support.ts"
import type { Vec3 } from "../../../src/vr/probe.ts"

test.afterEach(async ({ browser }) => closeAllTabs(browser))

/** The turn a controller held at `from` gets when Controllers.point() aims it at `to`. */
const aim = (from: Vec3, to: Vec3): Quaternion => {
  const direction = to.map((component, i) => component - from[i]!) as Vec3
  return new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), new Vector3(...direction).normalize())
}

test("a flag round's card shows the flag in its own shape, can be held, turned and put back, and the fill pail fills a country", async ({
  browser
}) => {
  const { headset, round, centre, can, card, hand } = await vrFlagRound(browser, "vr-flag-card")
  await headset.panels.expectPictureInFlagShape()
  await headset.settle()
  await round.screenshot(shot(`vr-7-flag.png`))

  // Grip it, pointing at it, to take it in hand; it follows the hand, and
  // goes back over the menu when let go.
  const grip: Vec3 = [hand[0] + 0.1, hand[1], hand[2]]
  await headset.controllers.pointRight(hand, card)
  await headset.frames(3)
  await headset.controllers.rightGrip(1)
  await headset.panels.expectPictureHeld(true)
  await headset.controllers.pointRight(grip, card)
  await headset.settle()
  await headset.panels.expectPictureDistanceFrom(card, { greaterThan: 0.2 })
  const held = await headset.panels.pictureHeld()
  await round.screenshot(shot(`vr-9-held.png`))
  // Turning the hand tilts it, as a card held up would.
  const tiltedTo: Vec3 = [grip[0], card[1] - 0.5, card[2]]
  await headset.controllers.pointRight(grip, tiltedTo)
  await headset.settle()
  // The hand's own turn, as Controllers.point() aims it, carries the picture's facing with it.
  const expected = new Vector3(...held.facing).applyQuaternion(aim(grip, tiltedTo).multiply(aim(grip, card).invert()))
  await headset.panels.expectPictureFacing(expected.toArray(), 0.05)
  await round.screenshot(shot(`vr-9b-tilted.png`))
  // Turned right round, it shows its back: the flag's reverse.
  const awayTo = grip.map((component, i) => 2 * component - card[i]!) as Vec3
  await headset.controllers.pointRight(grip, awayTo)
  await headset.settle()
  await headset.panels.expectPictureTurnedFrom(held.facing, { greaterThan: 2.5 })
  await headset.panels.expectPictureBack(PictureBack.REVERSE)
  await round.screenshot(shot(`vr-9c-back.png`))
  await headset.controllers.rightGrip(0)
  await headset.panels.expectPictureHeld(false)
  await headset.panels.expectPictureDistanceFrom(card, { lessThan: 0.01 })

  // It says how to answer; A brings out the fill pail, whose pull fills the
  // country it points at, and a second pull takes the fill off.
  await headset.panels.expectMode(/^Paint /)
  await headset.controllers.button(Hand.RIGHT, "a-button")
  await headset.controllers.button(Hand.RIGHT, "a-button")
  await headset.scene.expectToolInHand(Hand.RIGHT, Tool.FILL)
  // Up and right of the globe's middle, at the prime meridian and the equator: the Sahel.
  const sahel: Vec3 = [centre[0] + 0.06, centre[1] + 0.05, centre[2] + 0.2]
  const pull = async (): Promise<void> => {
    await headset.controllers.pointRight(can, sahel)
    await headset.frames(3)
    await headset.controllers.rightTrigger(1)
    await headset.frames(3)
    await headset.controllers.rightTrigger(0)
    await headset.frames(3)
  }
  await pull()
  await round.map.expectYourPaintCells({ atLeast: 1 })
  await round.screenshot(shot(`vr-9d-filled.png`))
  await pull()
  await round.map.expectYourPaintCells({ exactly: 0 })
  await headset.controllers.button(Hand.RIGHT, "a-button")
  await headset.scene.expectToolInHand(Hand.RIGHT, Tool.PAINT)
})

test("on a flag round's answer, Show all flags pins every flag, pointing at one names it and outlines its border at any zoom, and Hide all flags takes them off", async ({
  browser
}) => {
  const { headset, round, hand } = await vrFlagAnswer(browser, "vr-flag-answer")
  await pressMenu(headset, hand, "flags")
  await headset.scene.expectFlagPins({ greaterThan: 190 }, { timeout: 30_000 })
  await headset.scene.expectBeamsShown(true)
  await headset.scene.expectFlagPinsOnPage({ greaterThan: 190 })
  await headset.settle()
  await round.screenshot(shot(`vr-11-all-flags.png`))

  // Pointing at a flag enlarges it and names its country.
  const facing = (await headset.scene.flagFacing())!
  await headset.controllers.pointRight(hand, facing.at)
  // The other hand may rest on some flag already: wait for this one.
  await headset.scene.expectFlagNamed(facing.name)
  await headset.scene.expectFlagOutlined(facing.name, 3)
  await headset.settle()
  await round.screenshot(shot(`vr-11b-flag-named.png`))

  // And with the whole globe in view.
  await headset.zoomOutUntilWhole()
  const wideFacing = (await headset.scene.flagFacing())!
  await headset.controllers.pointRight(hand, wideFacing.at)
  await headset.scene.expectFlagOutlined(wideFacing.name, 3)
  await headset.settle()
  await round.screenshot(shot(`vr-11b-border-zoomed-out.png`))

  // Zoomed right in, to a city's width, the flags still show.
  await headset.zoomInUntilScale(150)
  await headset.scene.expectFlagPins({ greaterThan: 190 })
  await headset.settle()
  await round.screenshot(shot(`vr-11c-flags-zoomed.png`))
  await pressMenu(headset, hand, "flags")
  await headset.scene.expectFlagPins({ exactly: 0 })
})
