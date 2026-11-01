// A dropped connection, against the dev servers: paint drawn while it is
// down reaches the server once it is back.
import { test } from "@playwright/test"
import type { WebSocketRoute } from "@playwright/test"
import { check, newTab } from "./support.ts"

test("reconnect", async ({ browser }) => {
  // Alice's game connection goes through a route the script can cut.
  const aliceTab = await newTab(browser, "Alice")
  let offline = false
  let live: WebSocketRoute | undefined = undefined
  await aliceTab.page.routeWebSocket(/\/ws/, (socket) => {
    if (offline) return void socket.close()
    socket.connectToServer()
    live = socket
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
  await aliceRoundPage.waitForDisconnect()
  // The upload after the stroke goes nowhere.
  await aliceRoundPage.map.untilUploaded(() => aliceRoundPage.map.drag({ across: 0.5, down: 0.4 }), "attempted")
  const painted = await aliceRoundPage.map.shownPaintCells()
  const { sent } = await aliceRoundPage.map.paintUploads()

  // Let it back; the client retries within a few seconds and sends the paint
  // again. A refresh then shows what the server holds.
  offline = false
  await aliceRoundPage.waitForReconnect()
  await aliceRoundPage.map.waitForPaintUpload("sent", sent)
  aliceRoundPage = await aliceRoundPage.reload()
  const restored = await aliceRoundPage.map.shownPaintCells()
  check(painted > 0 && restored > 0, `paint drawn offline reached the server (${painted} drawn, ${restored} back)`)
})
