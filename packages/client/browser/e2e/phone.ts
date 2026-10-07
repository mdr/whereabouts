// Every screen at phone size (Playwright's iPhone 13 profile, 390 px wide),
// against the dev servers: the layout never makes the page wider than the
// screen, and the controls a player needs are on screen and uncovered.
// Run the game server with ROUND_MS=12000 ROUNDS=2.
// Usage, from packages/client: node browser/e2e/phone.ts [outDir]
import { devices } from "playwright-core"
import type { Screen } from "../pages/Screen.ts"
import { Checks, launchChrome, newTab, outDir } from "./support.ts"

const out = outDir()
const checks = new Checks()
const browser = await launchChrome()
const phone = devices["iPhone 13"]

async function fits(screen: Screen, label: string): Promise<void> {
  const fit = await screen.fit()
  await screen.screenshot(`${out}/phone-${label}.png`)
  checks.check(
    fit.viewportWidth === phone.viewport.width,
    `${label}: layout viewport ${fit.viewportWidth} is the screen width`
  )
  checks.check(fit.scrollWidth <= fit.viewportWidth, `${label}: no horizontal scroll (${fit.scrollWidth})`)
  checks.check(
    fit.overflowing.length === 0,
    `${label}: nothing overflows${fit.overflowing.length ? `: ${fit.overflowing.slice(0, 5).join(", ")}` : ""}`
  )
}

const aliceHomePage = await (await newTab(browser, "Alice")).openHome()
await aliceHomePage.enterName("Alice")
const aliceLobbyPage = await aliceHomePage.hostGame()
const code = await aliceLobbyPage.code()

const bobHomePage = await (
  await newTab(browser, "Bob", { context: { ...phone, isMobile: true, hasTouch: true } })
).openHome()
await fits(bobHomePage, "home")
await bobHomePage.enterName("Bobbington")
const bobLobbyPage = await bobHomePage.joinGame(code)
await fits(bobLobbyPage, "lobby")

const aliceRoundPage = await aliceLobbyPage.startGame()
const bobRoundPage = await bobLobbyPage.waitForGameToStart()
await fits(bobRoundPage, "ingame")
checks.check(await bobRoundPage.doneButtonIsUsable(), "ingame: the Done button is usable")
checks.check(await bobRoundPage.paintTools.toolIsUsable("pan"), "ingame: the Pan tool is usable")
checks.check(await bobRoundPage.map.attributionIsUsable(), "ingame: the map attribution button is usable")
checks.check(await bobRoundPage.map.attributionClearsToolbar(), "ingame: the attribution button clears the toolbar")

// One finger on the strip of map left clear (a photo makes the question card tall).
await bobRoundPage.map.fingerDrag(await bobRoundPage.map.spotClearOfCards())
const cells = await bobRoundPage.map.yourPaintCells()
checks.check(cells > 0, `a one-finger drag paints (${cells} cells)`)
await bobRoundPage.playersPanel.open()
await fits(bobRoundPage, "ingame-players")
await bobRoundPage.playersPanel.close()
const bobRoundDonePage = await bobRoundPage.finish()
await fits(bobRoundDonePage, "ingame-done")

// Alice never presses Done, so the round runs out of time.
const aliceRevealPage = await aliceRoundPage.waitForReveal(60_000)
const bobRevealPage = await bobRoundDonePage.waitForReveal(60_000)
await fits(bobRevealPage, "reveal")
checks.check(await bobRevealPage.readyButtonIsUsable(), "reveal: the Ready button is usable")
checks.check(await bobRevealPage.scoresAreUsable(), "reveal: the scores list is usable")
checks.check(await bobRevealPage.map.attributionClearsToolbar(), "reveal: the attribution button clears the toolbar")

await (await aliceRevealPage.hud.askToEndGame()).confirm()
const bobResultsPage = await bobRevealPage.waitForResults(60_000)
await fits(bobResultsPage, "results")

await browser.close()
checks.finish()
