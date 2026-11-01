// Flag rounds in VR, on an emulated Quest 3 (see pages/Headset.ts).
// Saves screenshots of the headset's view.
import { test } from "@playwright/test"
import { Quaternion, Vector3 } from "three"
import { Tool } from "../../../src/paint/tool.ts"
import { flagRevealTestIds } from "../../../src/ui/round/FlagRevealTestIds.ts"
import { flagImageTestIds } from "../../../src/ui/round/question/FlagImageTestIds.ts"
import { Hand } from "../../../src/vr/hands/hand.ts"
import { PictureBack } from "../../../src/vr/picture/picture-back.ts"
import { until } from "../../pages/support.ts"
import { check, shot } from "../support.ts"
import { vrFlagAnswer, vrFlagRound } from "./vr-states.ts"
import { closeAllTabs, pressMenu } from "./vr-support.ts"
import type { Vec3 } from "../../../src/vr/probe.ts"

test.afterEach(async ({ browser }) => closeAllTabs(browser))

/** The angle between two directions, in radians. */
function angleBetween(a: number[], b: number[]): number {
  return Math.acos(a.reduce((s, x, i) => s + x * b[i]!, 0) / Math.hypot(...a) / Math.hypot(...b))
}

/** The turn a controller held at `from` gets when Headset.point() aims it at `to`. */
function aim(from: Vec3, to: Vec3): Quaternion {
  const direction = to.map((c, i) => c - from[i]!) as Vec3
  return new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), new Vector3(...direction).normalize())
}

test("a flag round's card shows the flag in its own shape, can be held, turned and put back, and the fill pail fills a country", async ({
  browser
}) => {
  const { tab, headset, round, centre, can, card, hand } = await vrFlagRound(browser, "vr-flag-card")
  const flag = await headset.picture()
  const flagRatio = Number(
    await tab.page
      .getByTestId(flagImageTestIds.flag)
      .evaluate((el) => (el as HTMLElement).style.getPropertyValue("--flag-ratio"))
  )
  check(
    flag !== undefined && Math.abs(flag[0] / flag[1] / flagRatio - 1) < 0.01,
    `a flag round shows the flag in VR in its own shape (${flag?.map((m) => m.toFixed(2)).join(" × ")} m, ratio ${flagRatio})`
  )
  await round.pause(1500)
  await round.screenshot(shot(`vr-7-flag.png`))

  // Grip it, pointing at it, to take it in hand; it follows the hand, and
  // goes back over the menu when let go.
  const grip: Vec3 = [hand[0] + 0.1, hand[1], hand[2]]
  await headset.pointRight(hand, card)
  await round.pause(300)
  await headset.rightGrip(1)
  await round.pause(500)
  await headset.pointRight(grip, card)
  await round.pause(800)
  const held = await headset.pictureHeld()
  const moved = Math.hypot(...held.at.map((c, i) => c - card[i]!))
  check(held.held && moved > 0.2, `gripping the flag takes it in hand (moved ${moved.toFixed(2)} m)`)
  await round.screenshot(shot(`vr-9-held.png`))
  // Turning the hand tilts it, as a card held up would.
  const tiltedTo: Vec3 = [grip[0], card[1] - 0.5, card[2]]
  await headset.pointRight(grip, tiltedTo)
  await round.pause(800)
  const tilted = await headset.pictureHeld()
  // The hand's own turn, as Headset.point() aims it, carries the picture's facing with it.
  const expected = new Vector3(...held.facing).applyQuaternion(aim(grip, tiltedTo).multiply(aim(grip, card).invert()))
  const astray = angleBetween(expected.toArray(), tilted.facing)
  check(
    astray < 0.05,
    `and turns with the hand (${angleBetween(held.facing, tilted.facing).toFixed(2)} rad, ${astray.toFixed(3)} off the hand's turn)`
  )
  await round.screenshot(shot(`vr-9b-tilted.png`))
  // Turned right round, it shows its back: the flag's reverse.
  const awayTo = grip.map((c, i) => 2 * c - card[i]!) as Vec3
  await headset.pointRight(grip, awayTo)
  await round.pause(800)
  const turned = await headset.pictureHeld()
  const turnedBy = angleBetween(held.facing, turned.facing)
  check(
    turned.held && turnedBy > 2.5 && turned.back === PictureBack.REVERSE,
    `turned round, it shows the flag's reverse (${turnedBy.toFixed(2)} rad)`
  )
  await round.screenshot(shot(`vr-9c-back.png`))
  await headset.rightGrip(0)
  await round.pause(500)
  const back = await headset.pictureHeld()
  const off = Math.hypot(...back.at.map((c, i) => c - card[i]!))
  check(!back.held && off < 0.01, `letting go puts it back (${off.toFixed(3)} m off)`)

  // It says how to answer; A brings out the fill pail, whose pull fills the
  // country it points at, and a second pull takes the fill off.
  const mode = (await headset.menu()).mode
  check(mode?.startsWith("Paint ") === true, `a flag round says how to answer it (${mode})`)
  await headset.button(Hand.RIGHT, "a-button")
  await headset.button(Hand.RIGHT, "a-button")
  check((await headset.toolInHand())[Hand.RIGHT] === Tool.FILL, "A twice brings out the fill pail")
  // Up and right of the globe's middle, at the prime meridian and the equator: the Sahel.
  const sahel: Vec3 = [centre[0] + 0.06, centre[1] + 0.05, centre[2] + 0.2]
  const pull = async () => {
    await headset.pointRight(can, sahel)
    await headset.frames(3)
    await headset.rightTrigger(1)
    await headset.frames(3)
    await headset.rightTrigger(0)
    await headset.frames(3)
  }
  await pull()
  const filled = await until(
    "the filled country",
    () => round.map.yourPaintCells(),
    (n) => n > 0
  )
  check(filled > 0, `a pull fills the country it points at (${filled} cells)`)
  await round.screenshot(shot(`vr-9d-filled.png`))
  await pull()
  check(
    (await until(
      "the fill taken off",
      () => round.map.yourPaintCells(),
      (n) => n === 0
    )) === 0,
    "and a second pull takes it off"
  )
  await headset.button(Hand.RIGHT, "a-button")
  check((await headset.toolInHand())[Hand.RIGHT] === Tool.PAINT, "A again goes back to the spray can")
})

test("on a flag round's answer, Show all flags pins every flag, pointing at one names it and outlines its border at any zoom, and Hide all flags takes them off", async ({
  browser
}) => {
  const { tab, headset, round, hand } = await vrFlagAnswer(browser, "vr-flag-answer")
  await pressMenu(headset, hand, "flags")
  const pins = await until(
    "the flags on the globe",
    () => headset.flagPins(),
    (n) => n > 190,
    30_000
  )
  check(pins > 190, `Show all flags pins every country's flag on the globe (${pins})`)
  check(
    await until(
      "the rays",
      () => headset.beamsShown(),
      (on) => on
    ),
    "rays from the hands show what they point at"
  )
  const pagePins = await tab.page.getByTestId(flagRevealTestIds.pin).count()
  check(pagePins > 190, `and on the page's map (${pagePins})`)
  await round.pause(1500)
  await round.screenshot(shot(`vr-11-all-flags.png`))

  // Pointing at a flag enlarges it and names its country.
  const facing = (await headset.flagFacing())!
  await headset.pointRight(hand, facing.at)
  // The other hand may rest on some flag already: wait for this one.
  const named = await until(
    "the flag's name",
    () => headset.flagNamed(),
    (n) => n === facing.name
  )
  check(named === facing.name, `pointing at a flag names its country (${named})`)
  const outlined = await headset.flagOutlined()
  check(
    outlined?.name === named && (outlined?.segments ?? 0) >= 3,
    `and picks out its border (${outlined?.segments} segments)`
  )
  await round.pause(500)
  await round.screenshot(shot(`vr-11b-flag-named.png`))

  // And with the whole globe in view.
  await headset.rightStick(0, 1)
  await round.pause(3000)
  await headset.rightStick(0, 0)
  const wide = await headset.globeScale()
  const wideFacing = (await headset.flagFacing())!
  await headset.pointRight(hand, wideFacing.at)
  const wideOutlined = await until(
    "the border, zoomed out",
    () => headset.flagOutlined(),
    (o) => o?.name === wideFacing.name
  )
  check(
    wide === 1 && (wideOutlined?.segments ?? 0) >= 3,
    `zoomed right out, it still picks out the border (${wideOutlined?.name}, ${wide.toFixed(1)} times)`
  )
  await round.pause(500)
  await round.screenshot(shot(`vr-11b-border-zoomed-out.png`))

  // Zoomed right in, to a city's width, the flags still show.
  await headset.rightStick(0, -1)
  await round.pause(6000)
  await headset.rightStick(0, 0)
  const deep = await headset.globeScale()
  check(deep >= 150, `the globe zooms in to a city's width (${deep.toFixed(0)} times)`)
  const zoomedPins = await headset.flagPins()
  check(zoomedPins > 190, `with the flags still shown (${zoomedPins})`)
  await round.pause(1500)
  await round.screenshot(shot(`vr-11c-flags-zoomed.png`))
  await pressMenu(headset, hand, "flags")
  check(
    (await until(
      "the flags off the globe",
      () => headset.flagPins(),
      (n) => n === 0
    )) === 0,
    "Hide all flags takes them off"
  )
})
