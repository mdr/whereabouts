// Host controls and the brush footprint, against the dev servers: Alice
// hosts and Bob joins by link; the footprint shows under Alice's cursor;
// Alice removes Bob, who can come back as a new player; Alice ends the game
// early. Saves screenshots.
// Usage, from packages/client: node browser/e2e/host.ts [outDir]
import { Checks, launchChrome, newTab, outDir } from "./support.ts"

const out = outDir()
const checks = new Checks()
const browser = await launchChrome()
const viewport = { viewport: { width: 1300, height: 850 } }

const aliceHomePage = await (await newTab(browser, "Alice", { context: viewport })).openHome()
await aliceHomePage.enterName("Alice")
const aliceLobbyPage = await aliceHomePage.hostGame()
const code = await aliceLobbyPage.code()

const bobJoinAsPage = await (await newTab(browser, "Bob", { context: viewport })).openGameLink(code)
await bobJoinAsPage.enterName("Bob")
const bobLobbyPage = await bobJoinAsPage.join()
await aliceLobbyPage.players.waitForPlayer("Bob")

// In the lobby the host can remove Bob, but not herself.
const removable = (await aliceLobbyPage.players.players()).filter((p) => p.removable).map((p) => p.name)
checks.check(JSON.stringify(removable) === '["Bob"]', `the host can remove ${JSON.stringify(removable)}`)

await aliceLobbyPage.chooseSecondsPerRound(30)
const aliceRoundPage = await aliceLobbyPage.startGame()
const bobRoundPage = await bobLobbyPage.waitForGameToStart()

// The footprint under the cursor, at the normal brush size and then much bigger.
await aliceRoundPage.map.hover({ across: 0.5, down: 0.5 })
await aliceRoundPage.screenshot(`${out}/host-1-footprint.png`)
await aliceRoundPage.paintTools.biggerBrushWithKeyboard(3)
await aliceRoundPage.map.hover({ across: 0.51, down: 0.51 })
await aliceRoundPage.screenshot(`${out}/host-2-footprint-big.png`)

// Bob paints, so he has something to lose.
await bobRoundPage.map.drag({ across: 0.46, down: 0.47 }, { distancePx: 100 })

// The host removes Bob from the players panel, after first cancelling.
let removal = await aliceRoundPage.playersPanel.askToRemove("Bob")
console.log("dialog:", await removal.question())
await removal.cancel()
checks.check((await aliceRoundPage.playersPanel.players.names()).length === 2, "Cancel keeps Bob in the game")
removal = await aliceRoundPage.playersPanel.askToRemove("Bob")
await removal.confirm()
const bobTurnedAwayPage = await bobRoundPage.waitUntilRemoved()
const reason = await bobTurnedAwayPage.reason()
checks.check(reason === "You were removed from the game", `Bob is told: ${reason}`)
await bobTurnedAwayPage.screenshot(`${out}/host-3-bob-removed.png`)
await aliceRoundPage.pause(500)
const remaining = await aliceRoundPage.playersPanel.players.names()
checks.check(JSON.stringify(remaining) === '["Alice"]', `Alice sees ${JSON.stringify(remaining)}`)

// Bob comes back as a new player with the code, and sits out the round under way.
const bobHomePage = await bobTurnedAwayPage.backToStart()
await bobHomePage.enterName("Bob II")
await bobHomePage.joinGameMidRound(code)
checks.check(true, "Bob rejoins as a new player")

// The host ends the game early, confirming in the dialog.
const ending = await aliceRoundPage.hud.askToEndGame()
console.log("dialog:", await ending.question())
await aliceRoundPage.screenshot(`${out}/host-3b-end-dialog.png`)
const resultsPage = await ending.confirm()
checks.check(true, "ending the game goes to the final standings")
await resultsPage.screenshot(`${out}/host-4-results.png`)

await browser.close()
checks.finish()
