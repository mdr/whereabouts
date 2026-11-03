// Leaving the lobby, against the in-process server: a guest goes straight
// home and Back does not rejoin; the host is asked first, told who takes over
// or that the game closes; and hosting again starts a new game with the setup
// the host last chose.
import { QuestionType } from "@whereabouts/shared/questions"
import { test } from "../game-server/game-server.ts"
import { newTab } from "./iwft-tab.ts"

test("lobby leave", async ({ browser, game }) => {
  const { aliceLobbyPage, firstBobLobbyPage, code } = await test.step("Alice hosts and Bob joins by link", async () => {
    const aliceHomePage = await (await newTab(browser, "Alice", { game })).openHome()
    await aliceHomePage.enterName("Alice")
    const aliceLobbyPage = await aliceHomePage.hostGame()
    const code = await aliceLobbyPage.code()
    const bobJoinAsPage = await (await newTab(browser, "Bob", { game })).openGameLink(code)
    await bobJoinAsPage.enterName("Bob")
    const firstBobLobbyPage = await bobJoinAsPage.join()
    await aliceLobbyPage.players.waitForPlayer("Bob")
    return { aliceLobbyPage, firstBobLobbyPage, code }
  })

  const bobJoinAgainPage = await test.step("a guest leaves at once, and Back does not rejoin", async () => {
    const bobHomePage = await firstBobLobbyPage.leave()
    await aliceLobbyPage.players.waitForPlayerGone("Bob")
    return bobHomePage.goBackToGame()
  })

  await test.step("a host alone is warned the game closes, and cancels", async () => {
    const leaving = await aliceLobbyPage.askToLeave()
    await leaving.expectText("It closes, since no one else is here.")
    await leaving.cancel()
    await aliceLobbyPage.players.expectNames(["Alice"])
  })

  const bobLobbyPage = await test.step("the host leaves with Bob there, naming him as the next host", async () => {
    await bobJoinAgainPage.enterName("Bob")
    const bobLobbyPage = await bobJoinAgainPage.join()
    await aliceLobbyPage.players.waitForPlayer("Bob")
    const leaving = await aliceLobbyPage.askToLeave()
    await leaving.expectText("Bob becomes the host.")
    await leaving.confirm()
    await bobLobbyPage.players.waitForPlayerGone("Alice")
    await bobLobbyPage.players.expectHost("Bob")
    return bobLobbyPage
  })

  await test.step("hosting again starts a new game with the setup Bob last chose", async () => {
    await bobLobbyPage.setOnlyQuestions(QuestionType.FLAG, 3)
    await bobLobbyPage.chooseHints(2)
    await bobLobbyPage.expectHints(2)
    const leaving = await bobLobbyPage.askToLeave()
    await leaving.expectText("It closes, since no one else is here.")
    const bobHomePage = await leaving.confirm()
    await bobHomePage.enterName("Bob")
    const newLobbyPage = await bobHomePage.hostGame()
    await newLobbyPage.expectCodeNot(code)
    await newLobbyPage.expectQuestionCount(QuestionType.FLAG, 3)
    await newLobbyPage.expectRoundCount(3)
    await newLobbyPage.expectHints(2)
  })
})
