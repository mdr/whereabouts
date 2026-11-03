// The lobby's game setup, against the in-process server: the host sets the
// questions, seconds, hints and map detail, and Bob, who joins by link, sees
// the decided values without controls and sees which one just changed. Each
// device keeps its own choice to start rounds on the Pan tool.
import { MapDetail } from "@whereabouts/shared/protocol/config"
import { QuestionType } from "@whereabouts/shared/questions"
import { Tool } from "../../src/paint/tool.ts"
import { SetupTileType } from "../../src/screens/lobby/setup/setup-tiles.ts"
import { test } from "../game-server/game-server.ts"
import { newTab } from "./iwft-tab.ts"

test("lobby setup", async ({ browser, game }) => {
  const { aliceLobbyPage, bobLobbyPage } = await test.step("Alice hosts and Bob joins by link", async () => {
    const aliceHomePage = await (await newTab(browser, "Alice", { game })).openHome()
    await aliceHomePage.enterName("Alice")
    const aliceLobbyPage = await aliceHomePage.hostGame()
    const bobJoinAsPage = await (await newTab(browser, "Bob", { game })).openGameLink(await aliceLobbyPage.code())
    await bobJoinAsPage.enterName("Bob")
    const bobLobbyPage = await bobJoinAsPage.join()
    await aliceLobbyPage.players.waitForPlayer("Bob")
    return { aliceLobbyPage, bobLobbyPage }
  })

  await test.step("the host cannot take the game below one round", async () => {
    await aliceLobbyPage.setOnlyQuestions(QuestionType.LANDMARK, 1)
    await aliceLobbyPage.expectCanLowerQuestionCount(QuestionType.LANDMARK, false)
    await aliceLobbyPage.expectRoundCount(1)
  })

  await test.step("the host sets the questions, seconds, hints and map detail", async () => {
    await aliceLobbyPage.setQuestionCount(QuestionType.LANDMARK, 3)
    await aliceLobbyPage.setQuestionCount(QuestionType.PLACE, 2)
    await aliceLobbyPage.expectCanLowerQuestionCount(QuestionType.LANDMARK, true)
    await aliceLobbyPage.expectQuestionCount(QuestionType.LANDMARK, 3)
    await aliceLobbyPage.expectQuestionCount(QuestionType.PLACE, 2)
    await aliceLobbyPage.expectRoundCount(5)
    await aliceLobbyPage.chooseSecondsPerRound(60)
    await aliceLobbyPage.expectSecondsPerRound(60)
    await aliceLobbyPage.chooseHints(1)
    await aliceLobbyPage.expectHints(1)
    await aliceLobbyPage.chooseMapDetail(MapDetail.WATER)
    await aliceLobbyPage.expectMapDetail(MapDetail.WATER)
  })

  await test.step("Bob sees the decided values, not controls", async () => {
    await bobLobbyPage.expectSetupSummary({
      rounds: "5",
      seconds: "60 s",
      hints: "1",
      questions: "3 landmarks · 2 place names",
      mapDetail: "Water"
    })
    await bobLobbyPage.expectRoundCount(5)
    await bobLobbyPage.expectCannotChangeSetup()
  })

  await test.step("Bob sees just the value the host changes next", async () => {
    await aliceLobbyPage.chooseSecondsPerRound(30)
    await bobLobbyPage.expectSetupSummary({
      rounds: "5",
      seconds: "30 s",
      questions: "3 landmarks · 2 place names"
    })
    await bobLobbyPage.expectChangedSetup([SetupTileType.SECONDS])
  })

  const { aliceRoundPage, bobRoundPage } =
    await test.step("each device keeps its own choice to start on Pan", async () => {
      await aliceLobbyPage.expectStartOnPan(false)
      await bobLobbyPage.expectStartOnPan(false)
      await bobLobbyPage.setStartOnPan(true)
      await bobLobbyPage.expectStartOnPan(true)
      const reloadedBobLobbyPage = await bobLobbyPage.reload()
      await reloadedBobLobbyPage.expectStartOnPan(true)
      const aliceRoundPage = await aliceLobbyPage.startGame()
      const bobRoundPage = await reloadedBobLobbyPage.waitForGameToStart()
      return { aliceRoundPage, bobRoundPage }
    })

  await test.step("the round opens on Pan for Bob and on Paint for Alice", async () => {
    await bobRoundPage.paintTools.expectSelectedTool(Tool.PAN)
    await aliceRoundPage.paintTools.expectSelectedTool(Tool.PAINT)
  })
})
