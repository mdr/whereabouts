// How a multiplayer game looks, from Home through the lobby, a round and its reveal to the final standings.
import { mixOf } from "@whereabouts/shared/protocol/config"
import { QuestionType } from "@whereabouts/shared/questions"
import { test } from "../game-server/game-server.ts"
import { newStillTab, stillServer } from "./still-tab.ts"

test.use({
  serverOptions: stillServer({
    config: { mix: mixOf({ [QuestionType.LANDMARK]: 1 }), roundLength: 60_000 },
    questions: (question) => question.label.startsWith("Gateway of India")
  })
})

test("a game", async ({ browser, game }) => {
  const tab = await newStillTab(browser, "Alice", game)

  const homePage = await test.step("home", async () => {
    const homePage = await tab.openHome()
    await homePage.expectScreenshot("home")
    return homePage
  })

  const { lobbyPage, others } = await test.step("the lobby", async () => {
    await homePage.enterName("Alice")
    const lobbyPage = await homePage.hostGame()
    const others = game.seat(["Bob", "Cara"])
    await lobbyPage.players.waitForPlayer("Cara")
    await lobbyPage.expectScreenshot("lobby")
    return { lobbyPage, others }
  })

  const roundPage = await test.step("a round, painted", async () => {
    const roundPage = await lobbyPage.startGame()
    await roundPage.map.stroke(await roundPage.map.spotClearOfCards())
    await roundPage.map.expectYourPaintCells({ greaterThan: 0 })
    await roundPage.expectScreenshot("round")
    return roundPage
  })

  const revealPage = await test.step("the reveal", async () => {
    game.paint(others[0]!, { lat: 20, lon: 75 }, 600)
    game.paint(others[1]!, { lat: 30, lon: 60 }, 900)
    const roundDonePage = await roundPage.finish()
    game.lock(others)
    const revealPage = await roundDonePage.waitForReveal()
    await revealPage.expectRowCount(3)
    await revealPage.expectScreenshot("reveal")
    return revealPage
  })

  await test.step("the final standings", async () => {
    const resultsPage = await revealPage.showFinalResults()
    await resultsPage.expectScreenshot("results")
  })
})
