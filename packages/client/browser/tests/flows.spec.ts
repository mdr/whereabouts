// The awkward multiplayer paths, against the dev servers: a refresh
// mid-round keeps the seat and paint, a late joiner sits a round out then
// plays (and passes), and Play again leads back to the same lobby.
import { test } from "@playwright/test"
import { newTab, shot } from "./support.ts"

test("flows", async ({ browser }) => {
  const { code, aliceLobbyPage, bobLobbyPage } = await test.step("Alice hosts and Bob joins", async () => {
    const aliceHomePage = await (await newTab(browser, "Alice")).openHome()
    await aliceHomePage.enterName("Alice")
    const aliceLobbyPage = await aliceHomePage.hostGame()
    const code = await aliceLobbyPage.code()
    const bobHomePage = await (await newTab(browser, "Bob")).openHome()
    await bobHomePage.enterName("Bob")
    const bobLobbyPage = await bobHomePage.joinGame(code)
    await aliceLobbyPage.players.waitForPlayer("Bob")
    // Round 1 must outlast a refresh and a late joiner arriving; Alice and Bob end it once Cara is in.
    await aliceLobbyPage.chooseSecondsPerRound(120)
    return { code, aliceLobbyPage, bobLobbyPage }
  })
  let aliceRoundPage = await aliceLobbyPage.startGame()
  let bobRoundPage = await bobLobbyPage.waitForGameToStart()

  await test.step("a refresh mid-round keeps the seat and the paint", async () => {
    await aliceRoundPage.map.untilUploaded(() => aliceRoundPage.map.drag({ across: 0.5, down: 0.4 }))
    await aliceRoundPage.map.expectShownPaintCells({ greaterThan: 0 })
    const before = await aliceRoundPage.map.shownPaintCells()
    aliceRoundPage = await aliceRoundPage.reload()
    // The upload is compacted to coarser cells, so the count drops but stays non-zero.
    await aliceRoundPage.map.expectShownPaintCells({ greaterThan: 0, atMost: before })
    await aliceRoundPage.playersPanel.open()
    await aliceRoundPage.playersPanel.players.expectCount(2)
    await aliceRoundPage.playersPanel.players.expectHost("Alice")
  })

  const caraRoundPage = await test.step("a late joiner sits round 1 out, then plays round 2", async () => {
    const caraHomePage = await (await newTab(browser, "Cara")).openHome()
    await caraHomePage.enterName("Cara")
    const caraSittingOutPage = await caraHomePage.joinGameMidRound(code)
    const aliceRoundDonePage = await aliceRoundPage.finish()
    const bobRevealPage = await bobRoundPage.finishLast()
    const aliceRevealPage = await aliceRoundDonePage.waitForReveal()
    const caraRevealPage = await caraSittingOutPage.waitForReveal()
    await aliceRevealPage.expectRowCount(3)
    await aliceRevealPage.expectRow("Cara", { roundScore: "sat out" })
    aliceRoundPage = await aliceRevealPage.nextRound()
    bobRoundPage = await bobRevealPage.waitForNextRound()
    return caraRevealPage.waitForNextRound()
  })

  const { aliceRevealPage, bobRevealPage } = await test.step("a pass shows as +250 on the round 2 reveal", async () => {
    // With nothing painted Done is a pass; Cara has no idea and takes it.
    await caraRoundPage.expectDoneLabel("Pass")
    const caraRoundDonePage = await caraRoundPage.finish()
    await caraRoundDonePage.screenshot(shot(`flows-cara-round2.png`))
    await bobRoundPage.map.drag({ across: 0.6, down: 0.5 })
    await aliceRoundPage.map.untilUploaded(() => aliceRoundPage.map.drag({ across: 0.4, down: 0.5 }))
    const aliceRoundDonePage = await aliceRoundPage.finish()
    const bobRevealPage = await bobRoundPage.finishLast()
    const aliceRevealPage = await aliceRoundDonePage.waitForReveal()
    await aliceRevealPage.expectRowCount(3)
    await aliceRevealPage.expectRow("Cara", { passed: true, roundScore: "+250" })
    return { aliceRevealPage, bobRevealPage }
  })

  await test.step("the final standings, then Play again", async () => {
    const aliceResultsPage = await aliceRevealPage.showFinalResults()
    const bobResultsPage = await bobRevealPage.waitForResults()
    await aliceResultsPage.expectStandingsCount(3)
    await aliceResultsPage.screenshot(shot(`flows-results.png`))
    await aliceResultsPage.playAgain()
    const bobLobbyAgainPage = await bobResultsPage.waitForLobby()
    await bobLobbyAgainPage.expectCode(code)
    await bobLobbyAgainPage.players.expectCount(3)
  })
})
