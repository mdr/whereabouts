// A dropped connection, against the in-process server: paint drawn while it
// is down reaches the server once it is back.
import { expect } from "@playwright/test"
import { test } from "../game-server/game-server.ts"
import { newTab } from "./iwft-tab.ts"

test("reconnect", async ({ browser, game }) => {
  const aliceTab = await newTab(browser, "Alice", { game })
  const aliceHomePage = await aliceTab.openHome()
  await aliceHomePage.enterName("Alice")
  const aliceLobbyPage = await aliceHomePage.hostGame()
  const aliceRoundPage = await aliceLobbyPage.startGame()

  // Cut the connection, and keep it down while Alice paints.
  aliceTab.connection!.cut()
  await aliceRoundPage.waitForDisconnect()
  // The upload after the stroke goes nowhere.
  await aliceRoundPage.map.untilUploaded(() => aliceRoundPage.map.drag({ across: 0.5, down: 0.4 }), "attempted")
  await aliceRoundPage.map.expectShownPaintCells({ greaterThan: 0 })
  const { sent } = await aliceRoundPage.map.paintUploads()
  await game.expectGame((played) =>
    expect(Object.keys(played.paintOf(played.playerTokens[0]!)?.cells ?? {})).toHaveLength(0)
  )

  // Let it back; the client retries within a few seconds and sends the paint again.
  aliceTab.connection!.restore()
  await aliceRoundPage.waitForReconnect()
  await aliceRoundPage.map.waitForPaintUpload("sent", sent)
  await game.expectGame((played) =>
    expect(Object.keys(played.paintOf(played.playerTokens[0]!)?.cells ?? {}).length).toBeGreaterThan(0)
  )
})
