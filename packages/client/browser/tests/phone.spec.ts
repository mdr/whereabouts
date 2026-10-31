// Every screen at phone size (Playwright's iPhone 13 profile, 390 px wide),
// against the dev servers: the layout never makes the page wider than the
// screen, and the controls a player needs are on screen and uncovered.
import { test } from "@playwright/test"
import { devices } from "@playwright/test"
import type { Screen } from "../pages/Screen.ts"
import { Tool } from "../../src/tool.ts"
import { QuestionType } from "@whereabouts/shared/questions"
import { check, newTab, shot } from "./support.ts"

test("phone", async ({ browser }) => {
  const phone = devices["iPhone 13"]

  async function fits(screen: Screen, label: string): Promise<void> {
    const fit = await screen.fit()
    await screen.screenshot(shot(`phone-${label}.png`))
    check(
      fit.viewportWidth === phone.viewport.width,
      `${label}: layout viewport ${fit.viewportWidth} is the screen width`
    )
    check(fit.scrollWidth <= fit.viewportWidth, `${label}: no horizontal scroll (${fit.scrollWidth})`)
    check(
      fit.overflowing.length === 0,
      `${label}: nothing overflows${fit.overflowing.length ? `: ${fit.overflowing.slice(0, 5).join(", ")}` : ""}`
    )
  }

  const { aliceLobbyPage, code } = await test.step("Alice hosts a photo game", async () => {
    const aliceHomePage = await (await newTab(browser, "Alice")).openHome()
    await aliceHomePage.enterName("Alice")
    const aliceLobbyPage = await aliceHomePage.hostGame()
    // Photos make the tallest question card.
    await aliceLobbyPage.setOnlyQuestions(QuestionType.LANDMARK, 2)
    const code = await aliceLobbyPage.code()
    return { aliceLobbyPage, code }
  })

  const bobLobbyPage = await test.step("Bob joins on a phone: home and lobby fit", async () => {
    const bobHomePage = await (
      await newTab(browser, "Bob", { context: { ...phone, isMobile: true, hasTouch: true } })
    ).openHome()
    await fits(bobHomePage, "home")
    await bobHomePage.enterName("Bobbington")
    const bobLobbyPage = await bobHomePage.joinGame(code)
    await fits(bobLobbyPage, "lobby")
    return bobLobbyPage
  })

  const { aliceRoundPage, bobRoundPage } =
    await test.step("the round screen fits and its controls are usable", async () => {
      const aliceRoundPage = await aliceLobbyPage.startGame()
      const bobRoundPage = await bobLobbyPage.waitForGameToStart()
      await fits(bobRoundPage, "ingame")
      check(await bobRoundPage.doneButtonIsUsable(), "ingame: the Done button is usable")
      check(await bobRoundPage.paintTools.toolIsUsable(Tool.PAN), "ingame: the Pan tool is usable")
      check(await bobRoundPage.map.attributionIsUsable(), "ingame: the map attribution button is usable")
      check(await bobRoundPage.map.attributionClearsToolbar(), "ingame: the attribution button clears the toolbar")
      check(await bobRoundPage.hud.questionFoldIsUsable(), "ingame: the question's fold button is usable")
      const unfolded = await bobRoundPage.hud.questionHeight()
      await bobRoundPage.hud.toggleQuestionFold()
      const folded = await bobRoundPage.hud.questionHeight()
      await fits(bobRoundPage, "ingame-folded")
      check(folded < unfolded, `ingame: folding shrinks the question (${unfolded} to ${folded} px)`)
      await bobRoundPage.hud.toggleQuestionFold()
      check((await bobRoundPage.hud.questionHeight()) === unfolded, "ingame: unfolding brings the whole question back")
      return { aliceRoundPage, bobRoundPage }
    })

  const bobRoundDonePage = await test.step("a one-finger drag paints, then Bob is done", async () => {
    // One finger on the strip of map left clear (a photo makes the question card tall).
    await bobRoundPage.map.fingerDrag(await bobRoundPage.map.spotClearOfCards())
    const cells = await bobRoundPage.map.yourPaintCells()
    check(cells > 0, `a one-finger drag paints (${cells} cells)`)
    await bobRoundPage.playersPanel.open()
    await fits(bobRoundPage, "ingame-players")
    await bobRoundPage.playersPanel.close()
    const bobRoundDonePage = await bobRoundPage.finish()
    await fits(bobRoundDonePage, "ingame-done")
    return bobRoundDonePage
  })

  // Alice never presses Done, so the round runs out of time.
  const { aliceRevealPage, bobRevealPage } =
    await test.step("the reveal fits and its controls are usable", async () => {
      const aliceRevealPage = await aliceRoundPage.waitForReveal(60_000)
      const bobRevealPage = await bobRoundDonePage.waitForReveal(60_000)
      await bobRevealPage.pause(1500)
      await fits(bobRevealPage, "reveal")
      check(await bobRevealPage.answerLineIsUsable(), "reveal: the question card at the top names the answer")
      check(await bobRevealPage.answerShowsAboveSheet(), "reveal: the answer shows on the map between the cards")
      await bobRevealPage.hud.toggleQuestionFold()
      await fits(bobRevealPage, "reveal-unfolded")
      await bobRevealPage.hud.toggleQuestionFold()
      check(await bobRevealPage.scoreIsUsable(), "reveal: your score is on screen")
      check(await bobRevealPage.readyButtonIsUsable(), "reveal: the Ready button is usable")
      check(await bobRevealPage.scoresAreUsable(), "reveal: the scores list is usable")
      check(await bobRevealPage.map.attributionClearsToolbar(), "reveal: the attribution button clears the toolbar")
      check(await bobRevealPage.readyButtonIsUsable(), "reveal: scrolled to the scores, Ready is still usable")
      await bobRevealPage.screenshot(shot(`phone-reveal-scrolled.png`))
      return { aliceRevealPage, bobRevealPage }
    })

  await test.step("the results fit", async () => {
    await (await aliceRevealPage.hud.askToEndGame()).confirm()
    const bobResultsPage = await bobRevealPage.waitForResults(60_000)
    await fits(bobResultsPage, "results")
  })
})
