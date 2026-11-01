// Starting states for the practice specs in an emulated headset.
import type { Browser } from "@playwright/test"
import { soloTestIds } from "../../src/screens/solo/SoloTestIds.ts"
import { VrViewType } from "../../src/vr/view/view.ts"
import type { Headset } from "../pages/Headset.ts"
import type { PracticeRoundPage } from "../pages/PracticeRoundPage.ts"
import { until } from "../pages/support.ts"
import type { Tab } from "../pages/Tab.ts"
import { enterVr, newHeadsetTab, poses, pressMenu, spray } from "./vr-support.ts"

type Vec = [number, number, number]

interface HeadsetPractice {
  tab: Tab
  headset: Headset
  round: PracticeRoundPage
}
interface VrPractice extends HeadsetPractice {
  centre: Vec
  can: Vec
}
interface VrFlagRound extends VrPractice {
  card: Vec
  hand: Vec
}

/** Flag questions, on the Political map, where a country round offers the fill tool. */
function flagRounds(): void {
  localStorage.setItem("wa.practiceTypes", "FLAG")
  localStorage.setItem("wa.mapDetail", "POLITICAL")
}

/** Practice open in a headset's browser, not yet in VR. */
export async function headsetPractice(
  browser: Browser,
  label: string,
  initScript?: () => void
): Promise<HeadsetPractice> {
  const { tab, headset } = await newHeadsetTab(browser, label, initScript)
  return { tab, headset, round: await tab.openPractice() }
}

/** A VR practice round, painting. */
export async function vrPractice(browser: Browser, label: string, initScript?: () => void): Promise<VrPractice> {
  const practice = await headsetPractice(browser, label, initScript)
  await enterVr(practice.tab, practice.headset)
  return { ...practice, ...(await poses(practice.headset)) }
}

/** A VR practice round with one stroke sprayed across the globe; `painted` is how many cells it covers. */
export async function vrPracticePainted(browser: Browser, label: string): Promise<VrPractice & { painted: number }> {
  const vr = await vrPractice(browser, label)
  await spray(vr.headset, vr.round, vr)
  // The stroke becomes an undo step only on a frame that sees the trigger let go.
  await vr.headset.frames(5)
  const painted = await until(
    "paint on the round",
    () => vr.round.map.yourPaintCells(),
    (n) => n > 0
  )
  return { ...vr, painted }
}

/** A VR practice round passed with nothing painted, its answer showing in VR. */
export async function vrPracticeAnswer(browser: Browser, label: string): Promise<VrPractice> {
  const vr = await vrPractice(browser, label)
  await until(
    "Pass on the menu",
    () => vr.headset.doneLabel(),
    (l) => l === "Pass"
  )
  await pressMenu(vr.headset, vr.can, "done")
  await until(
    "the passed round's answer in VR",
    () => vr.headset.view(),
    (v) => v === VrViewType.REVEAL
  )
  await vr.tab.page.getByTestId(soloTestIds.roundScore).waitFor()
  return vr
}

/** A flag practice round in VR, its flag card over the menu: `card` is where the card rests, `hand` a spot beside it to point from. */
export async function vrFlagRound(browser: Browser, label: string): Promise<VrFlagRound> {
  const vr = await vrPractice(browser, label, flagRounds)
  await until(
    "the flag in VR",
    () => vr.headset.picture(),
    (p) => p !== undefined,
    60_000
  )
  const card = (await vr.headset.pictureHeld()).at
  return { ...vr, card, hand: [card[0] + 0.25, card[1] - 0.15, card[2] + 0.3] }
}

/** A flag practice round passed in VR, its answer showing. */
export async function vrFlagAnswer(browser: Browser, label: string): Promise<VrFlagRound> {
  const flag = await vrFlagRound(browser, label)
  await pressMenu(flag.headset, flag.hand, "done")
  await until(
    "the flag round's answer",
    () => flag.headset.view(),
    (v) => v === VrViewType.REVEAL
  )
  return flag
}
