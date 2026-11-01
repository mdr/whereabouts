// Flag rounds in VR, on an emulated Quest 3 (see pages/headset/Headset.ts).
// Saves screenshots of the headset's view.
import { test } from "@playwright/test"
import { Quaternion, Vector3 } from "three"
import { Tool } from "../../../src/paint/tool.ts"
import { allFlagsTestIds } from "../../../src/ui/round/flag-reveal/AllFlags/AllFlagsTestIds.ts"
import { flagImageTestIds } from "../../../src/ui/round/question/FlagImage/FlagImageTestIds.ts"
import { Hand } from "../../../src/vr/hands/hand.ts"
import { PictureBack } from "../../../src/vr/picture/picture-back.ts"
import { holdUntil, until } from "../../pages/support.ts"
import { check, shot } from "../support.ts"
import { vrFlagAnswer, vrFlagRound } from "./vr-states.ts"
import { closeAllTabs, pressMenu } from "./vr-support.ts"
import type { Vec3 } from "../../../src/vr/probe.ts"

test.afterEach(async ({ browser }) => closeAllTabs(browser))

/** The angle between two directions, in radians. */
const angleBetween = (a: number[], b: number[]): number =>
  Math.acos(a.reduce((sum, component, i) => sum + component * b[i]!, 0) / Math.hypot(...a) / Math.hypot(...b))

/** The turn a controller held at `from` gets when Controllers.point() aims it at `to`. */
const aim = (from: Vec3, to: Vec3): Quaternion => {
  const direction = to.map((component, i) => component - from[i]!) as Vec3
  return new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), new Vector3(...direction).normalize())
}

test("a flag round's card shows the flag in its own shape, can be held, turned and put back, and the fill pail fills a country", async ({
  browser
}) => {
  const { tab, headset, round, centre, can, card, hand } = await vrFlagRound(browser, "vr-flag-card")
  const flag = await headset.panels.picture()
  const flagRatio = Number(
    await tab.page
      .getByTestId(flagImageTestIds.flag)
      .evaluate((element) => (element as HTMLElement).style.getPropertyValue("--flag-ratio"))
  )
  check(
    flag !== undefined && Math.abs(flag[0] / flag[1] / flagRatio - 1) < 0.01,
    `a flag round shows the flag in VR in its own shape (${flag?.map((metres) => metres.toFixed(2)).join(" × ")} m, ratio ${flagRatio})`
  )
  await headset.settle()
  await round.screenshot(shot(`vr-7-flag.png`))

  // Grip it, pointing at it, to take it in hand; it follows the hand, and
  // goes back over the menu when let go.
  const grip: Vec3 = [hand[0] + 0.1, hand[1], hand[2]]
  await headset.controllers.pointRight(hand, card)
  await headset.frames(3)
  await headset.controllers.rightGrip(1)
  await until(
    "the flag taken in hand",
    () => headset.panels.pictureHeld(),
    (state) => state.held
  )
  await headset.controllers.pointRight(grip, card)
  await headset.settle()
  const held = await headset.panels.pictureHeld()
  const moved = Math.hypot(...held.at.map((component, i) => component - card[i]!))
  check(held.held && moved > 0.2, `gripping the flag takes it in hand (moved ${moved.toFixed(2)} m)`)
  await round.screenshot(shot(`vr-9-held.png`))
  // Turning the hand tilts it, as a card held up would.
  const tiltedTo: Vec3 = [grip[0], card[1] - 0.5, card[2]]
  await headset.controllers.pointRight(grip, tiltedTo)
  await headset.settle()
  const tilted = await headset.panels.pictureHeld()
  // The hand's own turn, as Controllers.point() aims it, carries the picture's facing with it.
  const expected = new Vector3(...held.facing).applyQuaternion(aim(grip, tiltedTo).multiply(aim(grip, card).invert()))
  const astray = angleBetween(expected.toArray(), tilted.facing)
  check(
    astray < 0.05,
    `and turns with the hand (${angleBetween(held.facing, tilted.facing).toFixed(2)} rad, ${astray.toFixed(3)} off the hand's turn)`
  )
  await round.screenshot(shot(`vr-9b-tilted.png`))
  // Turned right round, it shows its back: the flag's reverse.
  const awayTo = grip.map((component, i) => 2 * component - card[i]!) as Vec3
  await headset.controllers.pointRight(grip, awayTo)
  await headset.settle()
  const turned = await headset.panels.pictureHeld()
  const turnedBy = angleBetween(held.facing, turned.facing)
  check(
    turned.held && turnedBy > 2.5 && turned.back === PictureBack.REVERSE,
    `turned round, it shows the flag's reverse (${turnedBy.toFixed(2)} rad)`
  )
  await round.screenshot(shot(`vr-9c-back.png`))
  await headset.controllers.rightGrip(0)
  const back = await until(
    "the flag let go",
    () => headset.panels.pictureHeld(),
    (state) => !state.held
  )
  const off = Math.hypot(...back.at.map((component, i) => component - card[i]!))
  check(!back.held && off < 0.01, `letting go puts it back (${off.toFixed(3)} m off)`)

  // It says how to answer; A brings out the fill pail, whose pull fills the
  // country it points at, and a second pull takes the fill off.
  const mode = (await headset.panels.menu()).mode
  check(mode?.startsWith("Paint ") === true, `a flag round says how to answer it (${mode})`)
  await headset.controllers.button(Hand.RIGHT, "a-button")
  await headset.controllers.button(Hand.RIGHT, "a-button")
  check((await headset.scene.toolInHand())[Hand.RIGHT] === Tool.FILL, "A twice brings out the fill pail")
  // Up and right of the globe's middle, at the prime meridian and the equator: the Sahel.
  const sahel: Vec3 = [centre[0] + 0.06, centre[1] + 0.05, centre[2] + 0.2]
  const pull = async () => {
    await headset.controllers.pointRight(can, sahel)
    await headset.frames(3)
    await headset.controllers.rightTrigger(1)
    await headset.frames(3)
    await headset.controllers.rightTrigger(0)
    await headset.frames(3)
  }
  await pull()
  const filled = await until(
    "the filled country",
    () => round.map.yourPaintCells(),
    (count) => count > 0
  )
  check(filled > 0, `a pull fills the country it points at (${filled} cells)`)
  await round.screenshot(shot(`vr-9d-filled.png`))
  await pull()
  check(
    (await until(
      "the fill taken off",
      () => round.map.yourPaintCells(),
      (count) => count === 0
    )) === 0,
    "and a second pull takes it off"
  )
  await headset.controllers.button(Hand.RIGHT, "a-button")
  check((await headset.scene.toolInHand())[Hand.RIGHT] === Tool.PAINT, "A again goes back to the spray can")
})

test("on a flag round's answer, Show all flags pins every flag, pointing at one names it and outlines its border at any zoom, and Hide all flags takes them off", async ({
  browser
}) => {
  const { tab, headset, round, hand } = await vrFlagAnswer(browser, "vr-flag-answer")
  await pressMenu(headset, hand, "flags")
  const pins = await until(
    "the flags on the globe",
    () => headset.scene.flagPins(),
    (count) => count > 190,
    30_000
  )
  check(pins > 190, `Show all flags pins every country's flag on the globe (${pins})`)
  check(
    await until(
      "the rays",
      () => headset.scene.beamsShown(),
      (on) => on
    ),
    "rays from the hands show what they point at"
  )
  const pagePins = await tab.page.getByTestId(allFlagsTestIds.pin).count()
  check(pagePins > 190, `and on the page's map (${pagePins})`)
  await headset.settle()
  await round.screenshot(shot(`vr-11-all-flags.png`))

  // Pointing at a flag enlarges it and names its country.
  const facing = (await headset.scene.flagFacing())!
  await headset.controllers.pointRight(hand, facing.at)
  // The other hand may rest on some flag already: wait for this one.
  const named = await until(
    "the flag's name",
    () => headset.scene.flagNamed(),
    (name) => name === facing.name
  )
  check(named === facing.name, `pointing at a flag names its country (${named})`)
  const outlined = await headset.scene.flagOutlined()
  check(
    outlined?.name === named && (outlined?.segments ?? 0) >= 3,
    `and picks out its border (${outlined?.segments} segments)`
  )
  await headset.settle()
  await round.screenshot(shot(`vr-11b-flag-named.png`))

  // And with the whole globe in view.
  const wide = await holdUntil(
    "the globe zoomed right out",
    () => headset.controllers.rightStick(0, 1),
    () => headset.scene.globeScale(),
    (scale) => scale === 1,
    () => headset.controllers.rightStick(0, 0),
    30_000
  )
  const wideFacing = (await headset.scene.flagFacing())!
  await headset.controllers.pointRight(hand, wideFacing.at)
  const wideOutlined = await until(
    "the border, zoomed out",
    () => headset.scene.flagOutlined(),
    (facing) => facing?.name === wideFacing.name
  )
  check(
    wide === 1 && (wideOutlined?.segments ?? 0) >= 3,
    `zoomed right out, it still picks out the border (${wideOutlined?.name}, ${wide.toFixed(1)} times)`
  )
  await headset.settle()
  await round.screenshot(shot(`vr-11b-border-zoomed-out.png`))

  // Zoomed right in, to a city's width, the flags still show.
  const deep = await holdUntil(
    "the globe zoomed in to a city's width",
    () => headset.controllers.rightStick(0, -1),
    () => headset.scene.globeScale(),
    (scale) => scale >= 150,
    () => headset.controllers.rightStick(0, 0),
    60_000
  )
  check(deep >= 150, `the globe zooms in to a city's width (${deep.toFixed(0)} times)`)
  const zoomedPins = await headset.scene.flagPins()
  check(zoomedPins > 190, `with the flags still shown (${zoomedPins})`)
  await headset.settle()
  await round.screenshot(shot(`vr-11c-flags-zoomed.png`))
  await pressMenu(headset, hand, "flags")
  check(
    (await until(
      "the flags off the globe",
      () => headset.scene.flagPins(),
      (count) => count === 0
    )) === 0,
    "Hide all flags takes them off"
  )
})
