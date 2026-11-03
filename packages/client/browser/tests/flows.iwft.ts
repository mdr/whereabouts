// The awkward multiplayer paths, against the in-process server: a refresh
// mid-round keeps the seat and paint, a late joiner sits a round out then
// plays (and passes), the one hint is used up, and Play again leads back to the same lobby. Bob is
// seated by the server, with no tab of his own.
import { HintAxis } from "@whereabouts/shared/hints"
import { evenMix } from "@whereabouts/shared/protocol/config"
import { RankMove } from "../../src/ui/players/rank-move.ts"
import { test } from "../game-server/game-server.ts"
import { newTab } from "./iwft-tab.ts"
import { shot } from "./support.ts"

test.use({ serverOptions: { config: { mix: evenMix(2), roundLength: 120_000 } } })

test("flows", async ({ browser, game }) => {
  const { code, aliceTab, aliceLobbyPage, bob } = await test.step("Alice hosts and Bob is seated", async () => {
    const aliceTab = await newTab(browser, "Alice", { game })
    const aliceHomePage = await aliceTab.openHome()
    await aliceHomePage.enterName("Alice")
    const aliceLobbyPage = await aliceHomePage.hostGame()
    const code = await aliceLobbyPage.code()
    const [bob] = game.seat(["Bob"])
    await aliceLobbyPage.players.waitForPlayer("Bob")
    return { code, aliceTab, aliceLobbyPage, bob: bob! }
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

  const { caraRoundPage, roundOneRows } =
    await test.step("a late joiner sits round 1 out, then plays round 2", async () => {
      const caraHomePage = await (await newTab(browser, "Cara", { game })).openHome()
      await caraHomePage.enterName("Cara")
      const caraSittingOutPage = await caraHomePage.joinGameMidRound(code)
      const aliceRoundDonePage = await aliceRoundPage.finish()
      game.lock([bob])
      const aliceRevealPage = await aliceRoundDonePage.waitForReveal()
      const caraRevealPage = await caraSittingOutPage.waitForReveal()
      await aliceRevealPage.expectRowCount(3)
      await aliceRevealPage.expectRow("Cara", { roundScore: "sat out" })
      const roundOneRows = await aliceRevealPage.rows()
      aliceRoundPage = await aliceRevealPage.nextRound()
      return { caraRoundPage: await caraRevealPage.waitForNextRound(), roundOneRows }
    })

  await test.step("round 2 offers Alice no hint, and Cara hers", async () => {
    await aliceRoundPage.map.expectNoHintShapes()
    await aliceRoundPage.expectNoHintOffered()
    await caraRoundPage.expectHintsLeft(1)
  })

  const { aliceRevealPage, caraRevealPage, roundTwoRows } =
    await test.step("a pass shows as +250 on the round 2 reveal", async () => {
      // With nothing painted Done is a pass; Cara has no idea and takes it, and so do the others,
      // so everyone gains the same and nobody changes rank.
      await caraRoundPage.expectDoneLabel("Pass")
      await aliceRoundPage.playersPanel.open()
      await aliceRoundPage.playersPanel.players.expectDone("Cara", false)
      const caraRoundDonePage = await caraRoundPage.finish()
      await aliceRoundPage.playersPanel.players.expectDone("Cara")
      await caraRoundDonePage.screenshot(shot(`flows-cara-round2.png`))
      const aliceRoundDonePage = await aliceRoundPage.finish()
      game.lock([bob])
      const aliceRevealPage = await aliceRoundDonePage.waitForReveal()
      await aliceRevealPage.expectRowCount(3)
      await aliceRevealPage.expectRow("Cara", { passed: true, roundScore: "+250" })
      await aliceRevealPage.expectRankMove("Alice", RankMove.SAME)
      await aliceRevealPage.expectRankMove("Bob", RankMove.SAME)
      await aliceRevealPage.expectRankMove("Cara", RankMove.SAME)
      const caraRevealPage = await caraRoundDonePage.waitForReveal()
      return { aliceRevealPage, caraRevealPage, roundTwoRows: await aliceRevealPage.rows() }
    })

  await test.step("the final standings agree with the reveals", async () => {
    const aliceResultsPage = await aliceRevealPage.showFinalResults()
    const caraResultsPage = await caraRevealPage.waitForResults()
    await aliceResultsPage.expectStandingsCount(3)
    await aliceResultsPage.expectWinner(roundTwoRows[0]!.name)
    // The reveal after the last round is in finishing order too.
    for (const [index, { name, total }] of roundTwoRows.entries()) {
      await aliceResultsPage.expectStanding(index + 1, name, total)
    }
    for (const [round, rows] of [roundOneRows, roundTwoRows].entries()) {
      for (const { name, roundScore } of rows) await aliceResultsPage.expectRoundScore(round + 1, name, roundScore)
    }
    await aliceResultsPage.expectStandingIsYou("Alice", true)
    await aliceResultsPage.expectStandingIsYou("Bob", false)
    await caraResultsPage.expectStandingIsYou("Cara", true)
    await caraResultsPage.expectStandingIsYou("Alice", false)
    await caraResultsPage.expectCannotPlayAgain()
    await aliceResultsPage.screenshot(shot(`flows-results.png`))

    // Held while the connection is down, since Play again would go nowhere.
    aliceTab.connection!.cut()
    await aliceResultsPage.expectPlayAgainHeldReconnecting()
    aliceTab.connection!.restore()
    await aliceResultsPage.expectPlayAgainAvailable()

    await aliceResultsPage.playAgain()
    const caraLobbyAgainPage = await caraResultsPage.waitForLobby()
    await caraLobbyAgainPage.expectCode(code)
    await caraLobbyAgainPage.players.expectCount(3)
  })
})
