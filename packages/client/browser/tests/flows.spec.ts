// The awkward multiplayer paths, against the dev servers: a refresh
// mid-round keeps the seat and paint, a late joiner sits a round out then
// plays (and passes), and Play again leads back to the same lobby.
import { test } from "@playwright/test"
import { check, newTab, shot } from "./support.ts"

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
    return { code, aliceLobbyPage, bobLobbyPage }
  })
  let aliceRoundPage = await aliceLobbyPage.startGame()
  let bobRoundPage = await bobLobbyPage.waitForGameToStart()

  await test.step("a refresh mid-round keeps the seat and the paint", async () => {
    await aliceRoundPage.map.drag({ across: 0.5, down: 0.4 })
    await aliceRoundPage.pause(900) // the paint uploads after a short pause
    const before = await aliceRoundPage.map.shownPaintCells()
    aliceRoundPage = await aliceRoundPage.reload()
    const after = await aliceRoundPage.map.shownPaintCells()
    // The upload is compacted to coarser cells, so the count drops but stays non-zero.
    check(before > 0 && after > 0 && after <= before, `paint restored after refresh (${before} -> ${after} cells)`)
    await aliceRoundPage.playersPanel.open()
    const players = await aliceRoundPage.playersPanel.players.players()
    check(
      players.length === 2 && players.some((p) => p.name === "Alice" && p.isHost),
      `still two players, Alice still host: ${JSON.stringify(players)}`
    )
  })

  const caraRoundPage = await test.step("a late joiner sits round 1 out, then plays round 2", async () => {
    const caraHomePage = await (await newTab(browser, "Cara")).openHome()
    await caraHomePage.enterName("Cara")
    const caraSittingOutPage = await caraHomePage.joinGameMidRound(code)
    check(true, "a late joiner is told they're sitting this round out")
    const aliceRevealPage = await aliceRoundPage.waitForReveal()
    const bobRevealPage = await bobRoundPage.waitForReveal()
    const caraRevealPage = await caraSittingOutPage.waitForReveal()
    const round1 = await aliceRevealPage.rows()
    check(
      round1.some((r) => r.name === "Cara" && r.roundScore === "sat out"),
      `Cara shown as sitting out round 1: ${JSON.stringify(round1)}`
    )
    aliceRoundPage = await aliceRevealPage.nextRound()
    bobRoundPage = await bobRevealPage.waitForNextRound()
    const caraRoundPage = await caraRevealPage.waitForNextRound()
    check(true, "the late joiner plays round 2")
    return caraRoundPage
  })

  const { aliceRevealPage, bobRevealPage } = await test.step("a pass shows as +250 on the round 2 reveal", async () => {
    // With nothing painted Done is a pass; Cara has no idea and takes it.
    check((await caraRoundPage.doneButtonLabel()) === "Pass", "with nothing painted, the button reads Pass")
    const caraRoundDonePage = await caraRoundPage.finish()
    await caraRoundDonePage.screenshot(shot(`flows-cara-round2.png`))
    await aliceRoundPage.map.drag({ across: 0.4, down: 0.5 })
    await bobRoundPage.map.drag({ across: 0.6, down: 0.5 })
    await aliceRoundPage.pause(800)
    const aliceRoundDonePage = await aliceRoundPage.finish()
    const bobRevealPage = await bobRoundPage.finishLast()
    const aliceRevealPage = await aliceRoundDonePage.waitForReveal()
    const round2 = await aliceRevealPage.rows()
    check(
      round2.some((r) => r.name === "Cara" && r.passed && r.roundScore === "+250"),
      `a pass shows as +250, tagged passed: ${JSON.stringify(round2)}`
    )
    return { aliceRevealPage, bobRevealPage }
  })

  await test.step("the final standings, then Play again", async () => {
    const aliceResultsPage = await aliceRevealPage.showFinalResults()
    const bobResultsPage = await bobRevealPage.waitForResults()
    const standings = await aliceResultsPage.standings()
    check(standings.length === 3, `three players in the final standings: ${JSON.stringify(standings)}`)
    await aliceResultsPage.screenshot(shot(`flows-results.png`))
    await aliceResultsPage.playAgain()
    const bobLobbyAgainPage = await bobResultsPage.waitForLobby()
    check((await bobLobbyAgainPage.code()) === code, "Play again brings everyone back to the same lobby")
    const inLobby = await bobLobbyAgainPage.players.names()
    check(inLobby.length === 3, `all three are in the lobby: ${JSON.stringify(inLobby)}`)
  })
})
