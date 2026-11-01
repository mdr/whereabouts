// Starting states for the practice specs in an emulated headset.
import type { Browser } from "@playwright/test"
import { VrViewType } from "../../../src/vr/view/view.ts"
import type { Headset } from "../../pages/headset/Headset.ts"
import { PracticeRevealPage } from "../../pages/PracticeRevealPage.ts"
import type { PracticeRoundPage } from "../../pages/PracticeRoundPage.ts"
import type { Tab } from "../../pages/Tab.ts"
import { enterVr, newHeadsetTab, poses, pressMenu, spray } from "./vr-support.ts"
import type { Vec3 } from "../../../src/vr/probe.ts"

interface HeadsetPractice {
  tab: Tab
  headset: Headset
  round: PracticeRoundPage
}
interface VrPractice extends HeadsetPractice {
  centre: Vec3
  can: Vec3
}
interface VrFlagRound extends VrPractice {
  card: Vec3
  hand: Vec3
}

/** Flag questions, on the Political map, where a country round offers the fill tool. */
const flagRounds = (): void => {
  localStorage.setItem("wa.practiceTypes", "FLAG")
  localStorage.setItem("wa.mapDetail", "POLITICAL")
}

/** Practice open in a headset's browser, not yet in VR. */
export const headsetPractice = async (
  browser: Browser,
  label: string,
  initScript?: () => void
): Promise<HeadsetPractice> => {
  const { tab, headset } = await newHeadsetTab(browser, label, initScript)
  return { tab, headset, round: await tab.openPractice() }
}

/** A VR practice round, painting. */
export const vrPractice = async (browser: Browser, label: string, initScript?: () => void): Promise<VrPractice> => {
  const practice = await headsetPractice(browser, label, initScript)
  await enterVr(practice.headset)
  return { ...practice, ...(await poses(practice.headset)) }
}

/** A VR practice round with one stroke sprayed across the globe; `painted` is how many cells it covers. */
export const vrPracticePainted = async (browser: Browser, label: string): Promise<VrPractice & { painted: number }> => {
  const vr = await vrPractice(browser, label)
  await spray(vr.headset, vr.round, vr)
  // The stroke becomes an undo step only on a frame that sees the trigger let go.
  await vr.headset.frames(5)
  await vr.round.map.expectYourPaintCells({ atLeast: 1 })
  const painted = await vr.round.map.yourPaintCells()
  return { ...vr, painted }
}

/** A VR practice round passed with nothing painted, its answer showing in VR. */
export const vrPracticeAnswer = async (browser: Browser, label: string): Promise<VrPractice> => {
  const vr = await vrPractice(browser, label)
  await vr.headset.panels.expectDoneLabel("Pass")
  await pressMenu(vr.headset, vr.can, "done")
  await vr.headset.panels.expectView(VrViewType.REVEAL)
  await PracticeRevealPage.whenShownInHeadset(vr.tab)
  return vr
}

/** A flag practice round in VR, its flag card over the menu: `card` is where the card rests, `hand` a spot beside it to point from. */
export const vrFlagRound = async (browser: Browser, label: string): Promise<VrFlagRound> => {
  const vr = await vrPractice(browser, label, flagRounds)
  await vr.headset.panels.expectPictureShown({ timeout: 60_000 })
  const card = (await vr.headset.panels.pictureHeld()).at
  return { ...vr, card, hand: [card[0] + 0.25, card[1] - 0.15, card[2] + 0.3] }
}

/** A flag practice round passed in VR, its answer showing. */
export const vrFlagAnswer = async (browser: Browser, label: string): Promise<VrFlagRound> => {
  const flag = await vrFlagRound(browser, label)
  await pressMenu(flag.headset, flag.hand, "done")
  await flag.headset.panels.expectView(VrViewType.REVEAL)
  return flag
}
