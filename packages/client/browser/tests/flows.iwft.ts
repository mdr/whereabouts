// The awkward multiplayer paths, against the in-process server: a refresh
// mid-round keeps the seat and paint, a late joiner sits a round out then
// plays (and passes), the one hint is used up, and Play again leads back to the same lobby. Bob is
// seated by the server, with no tab of his own.
import { HintAxis } from "@whereabouts/shared/hints"
import { evenMix } from "@whereabouts/shared/protocol/config"
import { test } from "../game-server/game-server.ts"
import { newTab } from "./iwft-tab.ts"
import { shot } from "./support.ts"

test.use({ serverOptions: { config: { mix: evenMix(2), roundLength: 120_000 } } })

test("flows", async ({ browser, game }) => {
  const { code, aliceLobbyPage, bob } = await test.step("Alice hosts and Bob is seated", async () => {
    const aliceHomePage = await (await newTab(browser, "Alice", { game })).openHome()
    await aliceHomePage.enterName("Alice")
    const aliceLobbyPage = await aliceHomePage.hostGame()
    const code = await aliceLobbyPage.code()
    const [bob] = game.seat(["Bob"])
    await aliceLobbyPage.players.waitForPlayer("Bob")
    return { code, aliceLobbyPage, bob: bob! }
  })
  let aliceRoundPage = await aliceLobbyPage.startGame()

  await test.step("Alice uses her one hint", async () => {
    await aliceRoundPage.devDrawer.expectAbsent()
    await aliceRoundPage.expectHintsLeft(1)
    await aliceRoundPage.useHint(HintAxis.LATITUDE)
    await aliceRoundPage.expectHintBand(HintAxis.LATITUDE)
    await aliceRoundPage.map.expectHintShapes({ exactly: 1 })
  })

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
    const caraHomePage = await (await newTab(browser, "Cara", { game })).openHome()
    await caraHomePage.enterName("Cara")
    const caraSittingOutPage = await caraHomePage.joinGameMidRound(code)
    const aliceRoundDonePage = await aliceRoundPage.finish()
    game.lock([bob])
    const aliceRevealPage = await aliceRoundDonePage.waitForReveal()
    const caraRevealPage = await caraSittingOutPage.waitForReveal()
    await aliceRevealPage.expectRowCount(3)
    await aliceRevealPage.expectRow("Cara", { roundScore: "sat out" })
    aliceRoundPage = await aliceRevealPage.nextRound()
    return caraRevealPage.waitForNextRound()
  })

  await test.step("round 2 offers Alice no hint, and Cara hers", async () => {
    await aliceRoundPage.map.expectNoHintShapes()
    await aliceRoundPage.expectNoHintOffered()
    await caraRoundPage.expectHintsLeft(1)
  })

  const { aliceRevealPage, caraRevealPage } =
    await test.step("a pass shows as +250 on the round 2 reveal", async () => {
      // With nothing painted Done is a pass; Cara has no idea and takes it.
      await caraRoundPage.expectDoneLabel("Pass")
      const caraRoundDonePage = await caraRoundPage.finish()
      await caraRoundDonePage.screenshot(shot(`flows-cara-round2.png`))
      game.paint(bob, { lat: 20, lon: 10 }, 300)
      await aliceRoundPage.map.untilUploaded(() => aliceRoundPage.map.drag({ across: 0.4, down: 0.5 }))
      const aliceRoundDonePage = await aliceRoundPage.finish()
      game.lock([bob])
      const aliceRevealPage = await aliceRoundDonePage.waitForReveal()
      await aliceRevealPage.expectRowCount(3)
      await aliceRevealPage.expectRow("Cara", { passed: true, roundScore: "+250" })
      const caraRevealPage = await caraRoundDonePage.waitForReveal()
      return { aliceRevealPage, caraRevealPage }
    })

  await test.step("the final standings, then Play again", async () => {
    const aliceResultsPage = await aliceRevealPage.showFinalResults()
    const caraResultsPage = await caraRevealPage.waitForResults()
    await aliceResultsPage.expectStandingsCount(3)
    await aliceResultsPage.screenshot(shot(`flows-results.png`))
    await aliceResultsPage.playAgain()
    const caraLobbyAgainPage = await caraResultsPage.waitForLobby()
    await caraLobbyAgainPage.expectCode(code)
    await caraLobbyAgainPage.players.expectCount(3)
  })
})
