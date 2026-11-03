// Every screen at phone size (Playwright's iPhone 13 profile, 390 px wide),
// against the in-process server: the layout never makes the page wider than the
// screen, and the controls a player needs are on screen and uncovered.
import { devices } from "@playwright/test"
import { test } from "../game-server/game-server.ts"
import type { Screen } from "../pages/Screen.ts"
import { Tool } from "../../src/paint/tool.ts"
import { QuestionType } from "@whereabouts/shared/questions"
import { mixOf } from "@whereabouts/shared/protocol/config"
import { ROUND_GRACE } from "@whereabouts/shared/game/game"
import { newTab } from "./iwft-tab.ts"
import { shot } from "./support.ts"

const ROUND_LENGTH = 60_000

// Photos make the tallest question card.
test.use({
  serverOptions: { config: { mix: mixOf({ [QuestionType.LANDMARK]: 2 }), roundLength: ROUND_LENGTH } }
})

test("phone", async ({ browser, game }) => {
  const phone = devices["iPhone 13"]

  const fits = async (screen: Screen, label: string): Promise<void> => {
    await screen.screenshot(shot(`phone-${label}.png`))
    await screen.expectFits(label, phone.viewport.width)
  }

  const { aliceLobbyPage, code } = await test.step("Alice hosts a photo game", async () => {
    const aliceHomePage = await (await newTab(browser, "Alice", { game })).openHome()
    await aliceHomePage.enterName("Alice")
    const aliceLobbyPage = await aliceHomePage.hostGame()
    const code = await aliceLobbyPage.code()
    // Four players are too many for the full scores table on a phone.
    game.seat(["Cara", "Dan"])
    return { aliceLobbyPage, code }
  })

  const bobLobbyPage = await test.step("Bob joins on a phone: home and lobby fit", async () => {
    const bobHomePage = await (
      await newTab(browser, "Bob", { context: { ...phone, isMobile: true, hasTouch: true }, game })
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
      await bobRoundPage.expectDoneUsable()
      await bobRoundPage.paintTools.expectToolUsable(Tool.PAN)
      await bobRoundPage.map.expectAttributionUsable()
      await bobRoundPage.map.expectAttributionClearsToolbar()
      await bobRoundPage.hud.expectQuestionFoldUsable()
      // Settled, so the photo has loaded and the height is the whole card's.
      await bobRoundPage.waitForLayoutToSettle()
      const unfolded = await bobRoundPage.hud.questionHeight()
      await bobRoundPage.hud.toggleQuestionFold()
      await bobRoundPage.hud.expectQuestionHeight("folding shrinks the question", { lessThan: unfolded })
      await fits(bobRoundPage, "ingame-folded")
      await bobRoundPage.hud.toggleQuestionFold()
      await bobRoundPage.hud.expectQuestionHeight("unfolding brings the whole question back", { exactly: unfolded })
      return { aliceRoundPage, bobRoundPage }
    })

  const bobRoundDonePage = await test.step("a one-finger drag paints, then Bob is done", async () => {
    // One finger on the strip of map left clear (a photo makes the question card tall).
    await bobRoundPage.map.fingerDrag(await bobRoundPage.map.spotClearOfCards())
    await bobRoundPage.map.expectYourPaintCells({ greaterThan: 0 })
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
      game.advance(ROUND_LENGTH + ROUND_GRACE)
      const aliceRevealPage = await aliceRoundPage.waitForReveal()
      const bobRevealPage = await bobRoundDonePage.waitForReveal()
      await bobRevealPage.waitForLayoutToSettle()
      await fits(bobRevealPage, "reveal")
      await bobRevealPage.expectAnswerLineUsable()
      await bobRevealPage.expectAnswerShowsAboveSheet()
      await bobRevealPage.hud.toggleQuestionFold()
      await fits(bobRevealPage, "reveal-unfolded")
      await bobRevealPage.hud.toggleQuestionFold()
      await bobRevealPage.expectScoreCardUsable()
      await bobRevealPage.expectReadyButtonUsable()
      await bobRevealPage.expectScoresUsable()
      await bobRevealPage.map.expectAttributionClearsToolbar()
      await bobRevealPage.expectReadyButtonUsable("scrolled to the scores, the Ready button is still usable")
      await bobRevealPage.screenshot(shot(`phone-reveal-scrolled.png`))
      return { aliceRevealPage, bobRevealPage }
    })

  await test.step("the results fit", async () => {
    await (await aliceRevealPage.hud.askToEndGame()).confirm()
    const bobResultsPage = await bobRevealPage.waitForResults()
    await fits(bobResultsPage, "results")
    await bobResultsPage.expectRoundsListed(1)
    await bobResultsPage.showEveryonesScores(4)
    await bobResultsPage.showJustTheWinners(1)
  })
})
