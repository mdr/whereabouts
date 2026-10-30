// A dropped connection, against the dev servers: paint drawn while it is
// down reaches the server once it is back.
// Usage, from packages/client: node browser/e2e/reconnect.ts [outDir]
import type { WebSocketRoute } from "playwright-core"
import { Checks, launchChrome, newTab } from "./support.ts"

const checks = new Checks()
const browser = await launchChrome()

// Alice's game connection goes through a route the script can cut.
const aliceTab = await newTab(browser, "Alice")
let offline = false
let live: WebSocketRoute | undefined = undefined
await aliceTab.page.routeWebSocket(/\/ws/, (ws) => {
  if (offline) return void ws.close()
  ws.connectToServer()
  live = ws
})
const aliceHomePage = await aliceTab.openHome()
await aliceHomePage.enterName("Alice")
const aliceLobbyPage = await aliceHomePage.hostGame()
const code = await aliceLobbyPage.code()
const bobHomePage = await (await newTab(browser, "Bob")).openHome()
await bobHomePage.enterName("Bob")
await bobHomePage.joinGame(code)
await aliceLobbyPage.players.waitForPlayer("Bob")
// Waiting out the reconnect takes most of a short test round.
await aliceLobbyPage.chooseSecondsPerRound(120)
let aliceRoundPage = await aliceLobbyPage.startGame()

// Cut the connection, and keep it down while Alice paints.
offline = true
await live!.close()
await aliceRoundPage.pause(500)
await aliceRoundPage.map.drag({ across: 0.5, down: 0.4 })
await aliceRoundPage.pause(900) // the upload after the stroke goes nowhere
const painted = await aliceRoundPage.map.shownPaintCells()

// Let it back; the client retries within a few seconds. A refresh then
// shows what the server holds.
offline = false
await aliceRoundPage.pause(6000)
aliceRoundPage = await aliceRoundPage.reload()
const restored = await aliceRoundPage.map.shownPaintCells()
checks.check(painted > 0 && restored > 0, `paint drawn offline reached the server (${painted} drawn, ${restored} back)`)

await browser.close()
checks.finish()
