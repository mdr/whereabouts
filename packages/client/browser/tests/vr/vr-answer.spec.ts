// A practice round's answer in VR, on an emulated Quest 3 (see pages/Headset.ts).
// Saves screenshots of the headset's view.
import { test } from "@playwright/test"
import { soloTestIds } from "../../../src/screens/solo/Solo/SoloTestIds.ts"
import { VrViewType } from "../../../src/vr/view/view.ts"
import { until } from "../../pages/support.ts"
import { check, shot } from "../support.ts"
import { vrPracticeAnswer, vrPracticePainted } from "./vr-states.ts"
import { closeAllTabs, pressMenu } from "./vr-support.ts"

test.afterEach(async ({ browser }) => closeAllTabs(browser))

test("Submit in VR shows the answer in the headset, and Next brings the next round, where Pass scores 250", async ({
  browser
}) => {
  const { tab, headset, round, can } = await vrPracticePainted(browser, "vr-submit")
  // Submit with the menu's button, pointing and pulling the trigger: the
  // headset stays on and shows the answer, and Next brings the next round to it.
  check((await headset.doneLabel()) === "Submit", "with paint down, the menu offers Submit")
  await pressMenu(headset, can, "done")
  // Not PracticeRevealPage.whenShown: the page's map, which it waits on, draws nothing while VR shows.
  const scoreText = tab.page.getByTestId(soloTestIds.roundScore)
  await scoreText.waitFor()
  const score = Number(await scoreText.innerText())
  check(score >= 0 && score <= 1000, `the sprayed round scores ${score}`)
  const revealed = await until(
    "the answer in VR",
    () => headset.view(),
    (viewType) => viewType === VrViewType.REVEAL
  )
  check((await headset.inSession()) && revealed === VrViewType.REVEAL, "submitting shows the answer in VR")
  const vrFact = await until(
    "the line about the answer",
    () => headset.fact(),
    (fact) => fact !== undefined
  )
  check((vrFact ?? "").length > 20, `with a line about it (${vrFact})`)
  const postcard = await until(
    "the answer's photo",
    () => headset.postcard(),
    (postcard) => postcard !== undefined
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
    (viewType) => viewType === VrViewType.PAINT
  )
  check((await headset.inSession()) && nextRound === VrViewType.PAINT, "Next brings the next round to VR")
  check(!(await headset.globeColourShown()), "and the plain land back")
  check(
    await until(
      "Pass on the menu",
      () => headset.doneLabel(),
      (label) => label === "Pass"
    ).then((label) => label === "Pass"),
    "with nothing painted, the menu offers Pass"
  )
  await pressMenu(headset, can, "done")
  const passed = await until(
    "the passed round's answer in VR",
    () => headset.view(),
    (viewType) => viewType === VrViewType.REVEAL
  )
  await scoreText.waitFor()
  const passScore = Number(await scoreText.innerText())
  check(passed === VrViewType.REVEAL && passScore === 250, `passing in VR scores ${passScore}`)
  check((await headset.scoreTable())?.rows.length === 2, "the score table lists both rounds")
  await round.screenshot(shot(`vr-10-passed.png`))
})

test("See your room swaps space for passthrough, the answer still showing", async ({ browser }) => {
  const { headset, round, can } = await vrPracticeAnswer(browser, "vr-passthrough")
  // See your room swaps space for passthrough, in a new session, still on the answer.
  await pressMenu(headset, can, "passthrough")
  const room = await until(
    "passthrough",
    async () => ({
      ...(await headset.surroundings()),
      on: await headset.inSession(),
      view: await headset.view()
    }),
    (state) => !state.space && state.passthrough && state.on && state.view === VrViewType.REVEAL,
    30_000
  )
  check(
    !room.space && room.passthrough && room.on && room.view === VrViewType.REVEAL,
    "See your room swaps space for passthrough, the answer still showing"
  )
  check((await headset.moon()) === undefined, "and the moon goes with space")
  await round.pause(1500)
  await round.screenshot(shot(`vr-11d-passthrough.png`))
})
