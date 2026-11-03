// Two players through an online game against the dev servers: setup,
// guessing, Done and Keep editing, the reveal, and ready-up into round 2.
// Saves screenshots.
import { test } from "@playwright/test"
import { QuestionType } from "@whereabouts/shared/questions"
import { HintAxis } from "@whereabouts/shared/hints"
import { newE2eTab } from "./e2e-tab.ts"
import { shot } from "./support.ts"

test("multiplayer", async ({ browser }) => {
  const { terrain, aliceLobbyPage, code } = await test.step("Alice hosts a game", async () => {
    const aliceTab = await newE2eTab(browser, "Alice")
    // Terrain tiles should load at the reveal only: shaded relief would give mountains away.
    const terrain = aliceTab.countTerrainTileRequests()
    const aliceHomePage = await aliceTab.openHome()
    await aliceHomePage.enterName("Alice")
    const aliceLobbyPage = await aliceHomePage.hostGame()
    const code = await aliceLobbyPage.code()
    console.log("code:", code)
    await aliceLobbyPage.screenshot(shot(`mp-1-lobby-host.png`))
    return { terrain, aliceLobbyPage, code }
  })

  // Bob plays with the dev drawer, so it gets exercised too, and with a long
  // name, so the lists are checked for overflow.
  const bobLobbyPage = await test.step("Bob joins by code", async () => {
    const bobHomePage = await (await newE2eTab(browser, "Bob", { dev: true })).openHome()
    await bobHomePage.enterName("Bobbington-Smythe")
    const bobLobbyPage = await bobHomePage.joinGame(code)
    await aliceLobbyPage.players.waitForPlayer("Bobbington-Smythe", 5_000)
    return bobLobbyPage
  })

  // The host makes it 3 photo rounds of 30 s; Bob sees the choice but can't change it.
  await test.step("the host's setup reaches Bob, who can't change it", async () => {
    await aliceLobbyPage.setOnlyQuestions(QuestionType.LANDMARK, 3)
    await aliceLobbyPage.chooseSecondsPerRound(30)
    await bobLobbyPage.expectSetupSummary({ rounds: "3", seconds: "30 s", questions: "3 landmarks" })
    await bobLobbyPage.expectCannotChangeSetup()
    await aliceLobbyPage.screenshot(shot(`mp-1b-lobby-settings.png`))
  })

  const { aliceRoundPage, bobRoundPage } = await test.step("the game starts with a photo question", async () => {
    const aliceRoundPage = await aliceLobbyPage.startGame()
    const bobRoundPage = await bobLobbyPage.waitForGameToStart()
    console.log("prompt:", await aliceRoundPage.hud.prompt())
    await aliceRoundPage.hud.expectQuestionPhoto()
    return { aliceRoundPage, bobRoundPage }
  })

  // Alice uses the game's one hint: a latitude band, shaded on her map only.
  await test.step("Alice hints and both guess", async () => {
    await aliceRoundPage.useHint(HintAxis.LATITUDE)
    await aliceRoundPage.expectHintBand(HintAxis.LATITUDE)
    await aliceRoundPage.map.expectHintShapes({ exactly: 1 })
    await bobRoundPage.map.expectNoHintShapes()
    await bobRoundPage.expectHintStillOffered()
    await aliceRoundPage.map.drag({ across: 0.62, down: 0.42 })
    await bobRoundPage.map.drag({ across: 0.3, down: 0.55 })
    await aliceRoundPage.screenshot(shot(`mp-2-guessing-alice.png`))
    await aliceRoundPage.playersPanel.open()
    await aliceRoundPage.screenshot(shot(`mp-2b-players-panel.png`))
    console.log("Bob's blobs (dev):", await bobRoundPage.devDrawer.blobs())
    await terrain.expectNone()
  })

  // Bob is done, changes his mind, and is done again; the round waits for Alice.
  const bobRoundDonePage = await test.step("Bob is done, keeps editing, and is done again", async () => {
    const bobEditingPage = await (await bobRoundPage.finish()).keepEditing()
    const bobRoundDonePage = await bobEditingPage.finish()
    await aliceRoundPage.expectStaysOpen()
    return bobRoundDonePage
  })

  // Once everyone is done the round ends without waiting for the clock.
  const { aliceRevealPage, bobRevealPage } = await test.step("the reveal comes once everyone is done", async () => {
    const aliceRevealPage = await aliceRoundPage.finishLast()
    const bobRevealPage = await bobRoundDonePage.waitForReveal(10_000)
    await aliceRevealPage.expectFactLine()
    await bobRevealPage.expectFact(await aliceRevealPage.fact())
    await aliceRevealPage.screenshot(shot(`mp-3-reveal-alice.png`))
    await terrain.expectSome()
    await aliceRevealPage.expectNoYouLabels(2)
    await aliceRevealPage.expectRow("Alice", { hinted: true })
    await aliceRevealPage.expectRow("Bobbington-Smythe", { hinted: false })
    return { aliceRevealPage, bobRevealPage }
  })

  // Everyone's paint shows together; Bob hovers Alice's name, then looks at her paint alone, hides all, and brings it back.
  await test.step("Bob views everyone's paint, then Alice's alone, then hides it", async () => {
    await bobRevealPage.map.expectShownPaintCells({ greaterThan: 0 })
    const everyone = await bobRevealPage.map.shownPaintCells()
    await bobRevealPage.screenshot(shot(`mp-3b-reveal-everyone.png`))
    await bobRevealPage.hoverPlayer("Alice")
    // Hovering Alice's name shows her paint over the rest dimmed, then everyone's again.
    await bobRevealPage.map.expectShownPaintCells({ greaterThan: 0, lessThan: everyone })
    await bobRevealPage.stopHovering()
    await bobRevealPage.map.expectShownPaintCells({ exactly: everyone })
    await bobRevealPage.showOnly("Alice")
    await bobRevealPage.map.expectShownPaintCells({ greaterThan: 0, lessThan: everyone })
    await bobRevealPage.screenshot(shot(`mp-4-reveal-bob-views-alice.png`))
    await bobRevealPage.toggleHidePaint()
    await bobRevealPage.map.expectShownPaintCells({ exactly: 0 })
    await bobRevealPage.screenshot(shot(`mp-4b-reveal-hidden.png`))
    await bobRevealPage.toggleHidePaint()
    await bobRevealPage.map.expectShownPaintCells({ exactly: everyone })
  })

  // Bob is ready, Alice (the host) is not, so nothing moves until she is.
  await test.step("round 2 starts once everyone is ready", async () => {
    await bobRevealPage.ready()
    await aliceRevealPage.expectReadyCount("1 of 2 ready")
    await aliceRevealPage.expectStaysShown()
    await aliceRevealPage.screenshot(shot(`mp-5-reveal-one-ready.png`))
    const aliceRound2Page = await aliceRevealPage.readyLast()
    await aliceRound2Page.hud.expectRound("Round 2 / 3")
    await aliceRound2Page.map.expectNoHintShapes()
    await aliceRound2Page.expectNoHintOffered()
  })
})
