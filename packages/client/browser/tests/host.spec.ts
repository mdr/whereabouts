// Host controls and the brush footprint, against the dev servers: Alice
// hosts and Bob joins by link; the footprint shows under Alice's cursor;
// Alice removes Bob, who can come back as a new player; Alice ends the game
// early. Carol opens a link to a game that has gone and hosts one under its
// code. Saves screenshots.
import { test } from "@playwright/test"
import { check, newTab, shot } from "./support.ts"

test("host", async ({ browser }) => {
  const viewport = { viewport: { width: 1300, height: 850 } }

  const { aliceLobbyPage, bobLobbyPage, code } = await test.step("Alice hosts and Bob joins by link", async () => {
    const aliceHomePage = await (await newTab(browser, "Alice", { context: viewport })).openHome()
    await aliceHomePage.enterName("Alice")
    const aliceLobbyPage = await aliceHomePage.hostGame()
    const code = await aliceLobbyPage.code()

    const bobJoinAsPage = await (await newTab(browser, "Bob", { context: viewport })).openGameLink(code)
    await bobJoinAsPage.enterName("Bob")
    const bobLobbyPage = await bobJoinAsPage.join()
    await aliceLobbyPage.players.waitForPlayer("Bob")
    return { aliceLobbyPage, bobLobbyPage, code }
  })

  // In the lobby the host can remove Bob, but not herself.
  const { aliceRoundPage, bobRoundPage } =
    await test.step("the host can remove Bob in the lobby, then starts", async () => {
      const removable = (await aliceLobbyPage.players.players())
        .filter((player) => player.removable)
        .map((player) => player.name)
      check(JSON.stringify(removable) === '["Bob"]', `the host can remove ${JSON.stringify(removable)}`)

      await aliceLobbyPage.chooseSecondsPerRound(30)
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
    console.log("dialog:", await removal.question())
    await removal.cancel()
    check((await aliceRoundPage.playersPanel.players.names()).length === 2, "Cancel keeps Bob in the game")
    removal = await aliceRoundPage.playersPanel.askToRemove("Bob")
    await removal.confirm()
    const bobTurnedAwayPage = await bobRoundPage.waitUntilRemoved()
    const reason = await bobTurnedAwayPage.reason()
    check(reason === "You were removed from the game", `Bob is told: ${reason}`)
    await bobTurnedAwayPage.screenshot(shot(`host-3-bob-removed.png`))
    await aliceRoundPage.pause(500)
    const remaining = await aliceRoundPage.playersPanel.players.names()
    check(JSON.stringify(remaining) === '["Alice"]', `Alice sees ${JSON.stringify(remaining)}`)
    return bobTurnedAwayPage
  })

  // Bob comes back as a new player with the code, and sits out the round under way.
  await test.step("Bob rejoins as a new player", async () => {
    const bobHomePage = await bobTurnedAwayPage.backToStart()
    await bobHomePage.enterName("Bob II")
    await bobHomePage.joinGameMidRound(code)
    check(true, "Bob rejoins as a new player")
  })

  // The host ends the game early, confirming in the dialog.
  await test.step("the host ends the game early", async () => {
    const ending = await aliceRoundPage.hud.askToEndGame()
    console.log("dialog:", await ending.question())
    await aliceRoundPage.screenshot(shot(`host-3b-end-dialog.png`))
    const resultsPage = await ending.confirm()
    check(true, "ending the game goes to the final standings")
    await resultsPage.screenshot(shot(`host-4-results.png`))
  })

  await test.step("Carol opens a link to a gone game and hosts one under its code", async () => {
    const oldCode = Array.from(
      { length: 4 },
      () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]
    ).join("")
    const carolJoinAsPage = await (await newTab(browser, "Carol", { context: viewport })).openGameLink(oldCode)
    await carolJoinAsPage.enterName("Carol")
    const carolTurnedAwayPage = await carolJoinAsPage.joinMissingGame()
    const missing = await carolTurnedAwayPage.reason()
    check(missing === "No game with that code", `Carol is told: ${missing}`)
    await carolTurnedAwayPage.screenshot(shot(`host-5-no-such-game.png`))
    const carolLobbyPage = await carolTurnedAwayPage.hostUnderCode()
    check((await carolLobbyPage.code()) === oldCode, `Carol hosts a game under ${oldCode}`)
    await carolLobbyPage.screenshot(shot(`host-6-hosting-old-code.png`))
  })
})
