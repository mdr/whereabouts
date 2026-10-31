// What is on screen when the clock runs out is what counts, and everyone sees
// the same reveal: paint erased before the deadline stays erased, and a stroke
// still going at zero neither draws over the reveal nor goes missing.
import { test } from "@playwright/test"
import { check, newTab, shot } from "./support.ts"

test("deadline", async ({ browser }) => {
  const aliceHomePage = await (await newTab(browser, "Alice")).openHome()
  await aliceHomePage.enterName("Alice")
  const aliceLobbyPage = await aliceHomePage.hostGame()
  const code = await aliceLobbyPage.code()
  const bobHomePage = await (await newTab(browser, "Bob")).openHome()
  await bobHomePage.enterName("Bob")
  const bobLobbyPage = await bobHomePage.joinGame(code)
  await aliceLobbyPage.players.waitForPlayer("Bob")
  const aliceRoundPage = await aliceLobbyPage.startGame()
  const bobRoundPage = await bobLobbyPage.waitForGameToStart()

  // Alice paints, lets it upload, then clears it all and waits out the clock.
  await aliceRoundPage.map.drag({ across: 0.4, down: 0.5 })
  await aliceRoundPage.pause(900)
  await aliceRoundPage.paintTools.clear()

  // Bob starts a long stroke just before zero and keeps the button down well past it.
  await bobRoundPage.hud.waitForCountdown(2)
  const stroke = bobRoundPage.map.drag({ across: 0.6, down: 0.5 }, { distance: 160, steps: 40, hold: 4_000 })
  const aliceRevealPage = await aliceRoundPage.waitForReveal()
  const bobRevealPage = await bobRoundPage.waitForReveal()
  await stroke
  await bobRevealPage.pause(500)

  const rows = await aliceRevealPage.rows()
  check(
    rows.some((r) => r.name === "Alice" && r.passed && r.roundScore === "+250"),
    `paint cleared before the deadline scores as a pass: ${JSON.stringify(rows)}`
  )
  check(
    rows.some((r) => r.name === "Bob" && !r.passed),
    `a stroke still going at zero counts: ${JSON.stringify(rows)}`
  )
  const aliceSees = await aliceRevealPage.map.shownPaintCells()
  const bobSees = await bobRevealPage.map.shownPaintCells()
  check(
    aliceSees > 0 && aliceSees === bobSees,
    `both players see the same paint at the reveal (${aliceSees} and ${bobSees} cells)`
  )
  await aliceRevealPage.screenshot(shot(`deadline-alice.png`))
  await bobRevealPage.screenshot(shot(`deadline-bob.png`))
})
