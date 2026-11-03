// Watching, against the in-process server: spectators are listed apart from
// the players with their own count; Bob steps back to watch and takes a seat
// again; and a spectator who watches a round under way can ask to play from
// the next question. Sam is a spectator seated by the server, with no tab.
import { test } from "../game-server/game-server.ts"
import { newTab } from "./iwft-tab.ts"

test("lobby watching", async ({ browser, game }) => {
  const { aliceLobbyPage, bobLobbyPage } =
    await test.step("Alice hosts, Bob joins by link and Sam watches", async () => {
      const aliceHomePage = await (await newTab(browser, "Alice", { game })).openHome()
      await aliceHomePage.enterName("Alice")
      const aliceLobbyPage = await aliceHomePage.hostGame()
      const bobJoinAsPage = await (await newTab(browser, "Bob", { game })).openGameLink(await aliceLobbyPage.code())
      await bobJoinAsPage.enterName("Bob")
      const bobLobbyPage = await bobJoinAsPage.join()
      await aliceLobbyPage.players.waitForPlayer("Bob")
      game.watch(["Sam"])
      return { aliceLobbyPage, bobLobbyPage }
    })

  await test.step("spectators are listed apart from the players, with their own count", async () => {
    await aliceLobbyPage.expectWatchingCount(1)
    await aliceLobbyPage.watchers.expectNames(["Sam"])
  })

  await test.step("a player steps back to watch, then takes a seat again", async () => {
    await bobLobbyPage.justWatch()
    await aliceLobbyPage.expectWatchingCount(2)
    await aliceLobbyPage.watchers.expectNames(["Bob", "Sam"])
    await bobLobbyPage.playInstead()
    await aliceLobbyPage.expectWatchingCount(1)
    await aliceLobbyPage.watchers.expectNames(["Sam"])
    await bobLobbyPage.justWatch()
    await aliceLobbyPage.expectWatchingCount(2)
  })

  await test.step("a spectator takes a seat once the round is under way, and sits it out", async () => {
    await aliceLobbyPage.startGame()
    const bobWatchingPage = await bobLobbyPage.waitForGameToStartWatching()
    await bobWatchingPage.playFromNextQuestion()
  })
})
