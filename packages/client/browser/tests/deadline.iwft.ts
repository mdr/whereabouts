// What is on screen when the clock runs out is what counts, and everyone sees
// the same reveal: paint erased before the deadline stays erased, and a stroke
// still going at zero neither draws over the reveal nor goes missing. The
// server's clock is moved on to just before zero, and Bob's page told by a refresh.
import { expect } from "@playwright/test"
import { ROUND_GRACE } from "@whereabouts/shared/game/game"
import { test } from "../game-server/game-server.ts"
import { newTab } from "./iwft-tab.ts"
import { shot } from "./support.ts"

const ROUND_LENGTH = 60_000

test.use({ serverOptions: { config: { roundLength: ROUND_LENGTH } } })

test("deadline", async ({ browser, game }) => {
  const aliceHomePage = await (await newTab(browser, "Alice", { game })).openHome()
  await aliceHomePage.enterName("Alice")
  const aliceLobbyPage = await aliceHomePage.hostGame()
  const code = await aliceLobbyPage.code()
  const bobHomePage = await (await newTab(browser, "Bob", { game })).openHome()
  await bobHomePage.enterName("Bob")
  const bobLobbyPage = await bobHomePage.joinGame(code)
  await aliceLobbyPage.players.waitForPlayer("Bob")
  const startedAt = Date.now()
  const aliceRoundPage = await aliceLobbyPage.startGame()
  let bobRoundPage = await bobLobbyPage.waitForGameToStart()

  // Alice paints, lets it upload, then clears it all and lets that upload.
  await aliceRoundPage.map.untilUploaded(() => aliceRoundPage.map.drag({ across: 0.4, down: 0.5 }))
  await aliceRoundPage.paintTools.clear()
  await game.expectGame((played) =>
    expect(Object.keys(played.paintOf(played.playerTokens[0]!)?.cells ?? {})).toHaveLength(0)
  )

  // Bob starts a long stroke just before zero and keeps the button down well past it.
  // The refresh gives his page the server's time, so it counts down from a few seconds.
  game.advance(ROUND_LENGTH - 8_000 - (Date.now() - startedAt))
  bobRoundPage = await bobRoundPage.reload()
  await bobRoundPage.hud.waitForCountdown(2)
  const stroke = bobRoundPage.map.drag({ across: 0.6, down: 0.5 }, { distance: 160, steps: 40, hold: 4_000 })
  await game.expectGame((played) =>
    expect(Object.keys(played.paintOf(played.playerTokens[1]!)?.cells ?? {}).length).toBeGreaterThan(0)
  )
  game.advance(ROUND_LENGTH + ROUND_GRACE)
  const aliceRevealPage = await aliceRoundPage.waitForReveal()
  const bobRevealPage = await bobRoundPage.waitForReveal()
  await stroke
  await aliceRevealPage.expectRowCount(2)

  // Paint cleared before the deadline scores as a pass; a stroke still going at zero counts.
  await aliceRevealPage.expectRow("Alice", { passed: true, roundScore: "+250" })
  await aliceRevealPage.expectRow("Bob", { passed: false })
  await aliceRevealPage.map.expectShownPaintCells({ greaterThan: 0 })
  const aliceSees = await aliceRevealPage.map.shownPaintCells()
  await bobRevealPage.map.expectShownPaintCells({ exactly: aliceSees })
  await aliceRevealPage.screenshot(shot(`deadline-alice.png`))
  await bobRevealPage.screenshot(shot(`deadline-bob.png`))
})
