// A game on the in-process server: the test picks the question, seats 16
// more players in the lobby and paints for them, checks the server got Alice's paint,
// ends the round by moving the server's clock, and hovers players at the reveal.
import { expect } from "@playwright/test"
import { mixOf } from "@whereabouts/shared/protocol/config"
import { QuestionType } from "@whereabouts/shared/questions"
import { Phase } from "@whereabouts/shared/protocol/views"
import { ROUND_GRACE } from "@whereabouts/shared/game/game"
import { test } from "../game-server/game-server.ts"
import { RevealPage } from "../pages/RevealPage.ts"
import { newTab } from "./iwft-tab.ts"

const ROUND_LENGTH = 60_000

test.use({
  serverOptions: {
    config: { mix: mixOf({ [QuestionType.PLACE]: 1 }), roundLength: ROUND_LENGTH },
    questions: (question) => question.id === "tashkent"
  }
})

test("in-process server", async ({ browser, game }) => {
  const tab = await newTab(browser, "Alice", { game })
  const homePage = await tab.openHome()
  await homePage.enterName("Alice")
  const lobbyPage = await homePage.hostGame()
  await game.expectGame((hosted) => expect(hosted.phase).toBe(Phase.LOBBY))
  const others = game.seat(Array.from({ length: 16 }, (_, i) => `Player ${i + 2}`))

  const roundPage = await lobbyPage.startGame()
  await roundPage.map.drag({ across: 0.5, down: 0.45 }, { distance: 120, steps: 20 })
  await game.expectGame((played) =>
    expect(Object.keys(played.paintOf(played.playerTokens[0]!)?.cells ?? {}).length).toBeGreaterThan(0)
  )
  others.forEach((token, i) => game.paint(token, { lat: 30 + i, lon: 50 + i * 3 }, 300))

  game.advance(ROUND_LENGTH + ROUND_GRACE)
  const revealPage = await RevealPage.whenShown(tab)
  await game.expectGame((revealed) => expect(revealed.phase).toBe(Phase.REVEAL))
  await revealPage.expectRowCount(17)
  for (const name of ["Player 2", "Player 9", "Player 17"]) {
    await revealPage.hoverPlayer(name)
    await revealPage.map.expectShownPaintCells({ greaterThan: 0 })
  }
  await revealPage.screenshot(test.info().outputPath("reveal-17.png"))
})
