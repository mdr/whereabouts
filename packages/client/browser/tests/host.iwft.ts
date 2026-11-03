// Host controls and the brush footprint, against the in-process server: Alice
// hosts and Bob joins by link; the footprint shows under Alice's cursor;
// Bob renames, goes offline and is handed the host role and hands it back;
// Alice removes Bob, who can come back as a new player; Alice ends the game
// early. Carol opens a link to a game that has gone and hosts one under its
// code. Saves screenshots.
import { test } from "../game-server/game-server.ts"
import { newTab } from "./iwft-tab.ts"
import { shot } from "./support.ts"

test.use({ serverOptions: { config: { roundLength: 30_000 } } })

test("host", async ({ browser, game }) => {
  const viewport = { viewport: { width: 1300, height: 850 } }

  const { aliceLobbyPage, bobLobbyPage, bobTab, code } =
    await test.step("Alice hosts and Bob joins by link", async () => {
      const aliceHomePage = await (await newTab(browser, "Alice", { context: viewport, game })).openHome()
      await aliceHomePage.enterName("Alice")
      const aliceLobbyPage = await aliceHomePage.hostGame()
      const code = await aliceLobbyPage.code()

      const bobTab = await newTab(browser, "Bob", { context: viewport, game })
      const bobJoinAsPage = await bobTab.openGameLink(code)
      await bobJoinAsPage.enterName("Bob")
      const bobLobbyPage = await bobJoinAsPage.join()
      await aliceLobbyPage.players.waitForPlayer("Bob")
      return { aliceLobbyPage, bobLobbyPage, bobTab, code }
    })

  // In the lobby the host can remove Bob, but not herself; a guest can remove no one.
  await test.step("only the host sees remove buttons", async () => {
    await aliceLobbyPage.players.expectRemovable(["Bob"])
    await bobLobbyPage.players.expectRemovable([])
  })

  await test.step("Bob renames himself and Alice sees it", async () => {
    await bobLobbyPage.rename("Bobby")
    await aliceLobbyPage.players.waitForPlayer("Bobby")
    await aliceLobbyPage.players.waitForPlayerGone("Bob")
    await bobLobbyPage.rename("Bob")
    await aliceLobbyPage.players.waitForPlayer("Bob")
  })

  await test.step("an offline Bob is tagged and cannot be made host", async () => {
    await aliceLobbyPage.players.expectOffline("Bob", false)
    await aliceLobbyPage.players.expectMakeable(["Bob"])
    bobTab.connection!.cut()
    await aliceLobbyPage.players.expectOffline("Bob")
    await aliceLobbyPage.players.expectMakeable([])
    bobTab.connection!.restore()
    await aliceLobbyPage.players.expectOffline("Bob", false)
    await aliceLobbyPage.players.expectMakeable(["Bob"])
  })

  await test.step("the host hands hosting to Bob, and he hands it back", async () => {
    await bobLobbyPage.players.expectMakeable([])
    let handover = await aliceLobbyPage.players.askToMakeHost("Bob")
    await handover.expectQuestion("Make Bob the host?")
    await handover.clickInside()
    await handover.dismissWithEscape()
    handover = await aliceLobbyPage.players.askToMakeHost("Bob")
    await handover.dismissWithBackdrop()
    await aliceLobbyPage.expectHostControls()

    handover = await aliceLobbyPage.players.askToMakeHost("Bob")
    await handover.confirm()
    await bobLobbyPage.expectHostControls()
    await bobLobbyPage.players.expectHost("Bob")
    await bobLobbyPage.players.expectRemovable(["Alice"])
    await aliceLobbyPage.expectHostControls(false)
    await aliceLobbyPage.players.expectRemovable([])

    await (await bobLobbyPage.players.askToMakeHost("Alice")).confirm()
    await aliceLobbyPage.expectHostControls()
    await aliceLobbyPage.players.expectHost("Alice")
    await bobLobbyPage.expectHostControls(false)
  })

  const { aliceRoundPage, bobRoundPage } = await test.step("the host starts", async () => {
    const aliceRoundPage = await aliceLobbyPage.startGame()
    const bobRoundPage = await bobLobbyPage.waitForGameToStart()
    return { aliceRoundPage, bobRoundPage }
  })

  // The footprint under the cursor, at the normal brush size and then much bigger.
  await test.step("the brush footprint shows under the cursor", async () => {
    await aliceRoundPage.map.hover({ across: 0.5, down: 0.5 })
    await aliceRoundPage.screenshot(shot(`host-1-footprint.png`))
    await aliceRoundPage.paintTools.biggerBrushWithKeyboard(3)
    await aliceRoundPage.map.hover({ across: 0.51, down: 0.51 })
    await aliceRoundPage.screenshot(shot(`host-2-footprint-big.png`))
  })

  // Bob paints, so he has something to lose.
  // The host removes Bob from the players panel, after first cancelling.
  const bobTurnedAwayPage = await test.step("the host cancels, then removes Bob from the players panel", async () => {
    await bobRoundPage.map.drag({ across: 0.46, down: 0.47 }, { distance: 100 })

    let removal = await aliceRoundPage.playersPanel.askToRemove("Bob")
    await removal.expectQuestion("Remove Bob from the game?")
    await removal.cancel()
    // Dismissing keeps Bob in the game.
    await aliceRoundPage.playersPanel.players.expectCountStays(2)
    removal = await aliceRoundPage.playersPanel.askToRemove("Bob")
    await removal.dismissWithEscape()
    removal = await aliceRoundPage.playersPanel.askToRemove("Bob")
    await removal.dismissWithBackdrop()
    await aliceRoundPage.playersPanel.players.expectCountStays(2)
    removal = await aliceRoundPage.playersPanel.askToRemove("Bob")
    await removal.confirm()
    const bobTurnedAwayPage = await bobRoundPage.waitUntilRemoved()
    await bobTurnedAwayPage.expectReason("You were removed from the game")
    await bobTurnedAwayPage.screenshot(shot(`host-3-bob-removed.png`))
    await aliceRoundPage.playersPanel.players.waitForPlayerGone("Bob")
    await aliceRoundPage.playersPanel.players.expectNames(["Alice"])
    return bobTurnedAwayPage
  })

  // Bob comes back as a new player with the code, and sits out the round under way.
  await test.step("Bob rejoins as a new player", async () => {
    const bobHomePage = await bobTurnedAwayPage.backToStart()
    await bobHomePage.enterName("Bob II")
    await bobHomePage.joinGameMidRound(code)
  })

  // The host ends the game early, confirming in the dialog.
  await test.step("the host ends the game early", async () => {
    const ending = await aliceRoundPage.hud.askToEndGame()
    await ending.expectQuestion("End the game now?")
    await ending.expectCoversViewport()
    await aliceRoundPage.screenshot(shot(`host-3b-end-dialog.png`))
    const resultsPage = await ending.confirm()
    await resultsPage.screenshot(shot(`host-4-results.png`))
  })

  await test.step("Carol opens a link to a gone game and hosts one under its code", async () => {
    const oldCode = Array.from(
      { length: 4 },
      () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]
    ).join("")
    const carolJoinAsPage = await (await newTab(browser, "Carol", { context: viewport, game })).openGameLink(oldCode)
    await carolJoinAsPage.enterName("Carol")
    const carolTurnedAwayPage = await carolJoinAsPage.joinMissingGame()
    await carolTurnedAwayPage.expectReason("No game with that code")
    await carolTurnedAwayPage.screenshot(shot(`host-5-no-such-game.png`))
    const carolLobbyPage = await carolTurnedAwayPage.hostUnderCode()
    await carolLobbyPage.expectCode(oldCode)
    await carolLobbyPage.screenshot(shot(`host-6-hosting-old-code.png`))
  })
})
