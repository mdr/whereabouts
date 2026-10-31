// Two players through an online game against the dev servers: setup,
// guessing, Done and Keep editing, the reveal, and ready-up into round 2.
// Saves screenshots.
import { test } from "@playwright/test"
import { QuestionType } from "@whereabouts/shared/questions"
import { HintAxis } from "@whereabouts/shared/hints"
import { check, newTab, shot } from "./support.ts"

test("multiplayer", async ({ browser }) => {
  const { terrain, aliceLobbyPage, code } = await test.step("Alice hosts a game", async () => {
    const aliceTab = await newTab(browser, "Alice")
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
    const bobHomePage = await (await newTab(browser, "Bob", { dev: true })).openHome()
    await bobHomePage.enterName("Bobbington-Smythe")
    const bobLobbyPage = await bobHomePage.joinGame(code)
    await aliceLobbyPage.players.waitForPlayer("Bobbington-Smythe", 5_000)
    return bobLobbyPage
  })

  // The host makes it 3 photo rounds of 30 s; Bob sees the choice but can't change it.
  await test.step("the host's setup reaches Bob, who can't change it", async () => {
    await aliceLobbyPage.setOnlyQuestions(QuestionType.LANDMARK, 3)
    await aliceLobbyPage.chooseSecondsPerRound(30)
    await bobLobbyPage.waitForSetupSummary({ rounds: "3", seconds: "30 s", questions: "3 landmarks" })
    check(true, "the host's setup reaches Bob")
    check(!(await bobLobbyPage.canChangeSetup()), "Bob can't change the setup")
    await aliceLobbyPage.screenshot(shot(`mp-1b-lobby-settings.png`))
  })

  const { aliceRoundPage, bobRoundPage } = await test.step("the game starts with a photo question", async () => {
    const aliceRoundPage = await aliceLobbyPage.startGame()
    const bobRoundPage = await bobLobbyPage.waitForGameToStart()
    console.log("prompt:", await aliceRoundPage.hud.prompt())
    check(await aliceRoundPage.hud.questionHasPhoto(), "a photos-only game asks a photo question")
    return { aliceRoundPage, bobRoundPage }
  })

  // Alice uses the game's one hint: a latitude band, shaded on her map only.
  await test.step("Alice hints and both guess", async () => {
    const band = await aliceRoundPage.useHint(HintAxis.LATITUDE)
    check(/^Between \d+(\.\d)?°[NS]? and \d+(\.\d)?°[NS]?$/.test(band), `Alice's hint names a band: ${band}`)
    check((await aliceRoundPage.map.shownHintShapes()) === 1, "the band is shaded on Alice's map")
    check((await bobRoundPage.map.shownHintShapes()) === 0, "and not on Bob's")
    check(await bobRoundPage.canUseHint(), "Bob still has his hint")
    await aliceRoundPage.map.drag({ across: 0.62, down: 0.42 })
    await bobRoundPage.map.drag({ across: 0.3, down: 0.55 })
    await aliceRoundPage.screenshot(shot(`mp-2-guessing-alice.png`))
    await aliceRoundPage.playersPanel.open()
    await aliceRoundPage.screenshot(shot(`mp-2b-players-panel.png`))
    console.log("Bob's blobs (dev):", await bobRoundPage.devDrawer.blobs())
    check(terrain.count() === 0, `no terrain tiles while guessing (${terrain.count()})`)
  })

  // Bob is done, changes his mind, and is done again; the round waits for Alice.
  const bobRoundDonePage = await test.step("Bob is done, keeps editing, and is done again", async () => {
    const bobEditingPage = await (await bobRoundPage.finish()).keepEditing()
    check(true, "Keep editing gives Bob his paint tools back")
    const bobRoundDonePage = await bobEditingPage.finish()
    await aliceRoundPage.pause(1000)
    check(await aliceRoundPage.isStillShown(), "the round stays open while Alice is still guessing")
    return bobRoundDonePage
  })

  // Once everyone is done the round ends without waiting for the clock.
  const { aliceRevealPage, bobRevealPage } = await test.step("the reveal comes once everyone is done", async () => {
    const aliceRevealPage = await aliceRoundPage.finishLast()
    const bobRevealPage = await bobRoundDonePage.waitForReveal(10_000)
    check(true, "the reveal comes as soon as everyone is done")
    const aliceFact = await aliceRevealPage.fact()
    const bobFact = await bobRevealPage.fact()
    check(aliceFact.length > 20 && aliceFact === bobFact, `everyone gets the same line about the answer (${aliceFact})`)
    await aliceRevealPage.screenshot(shot(`mp-3-reveal-alice.png`))
    check(terrain.count() > 0, `terrain tiles at the reveal (${terrain.count()})`)
    const rows = await aliceRevealPage.rows()
    console.log("reveal rows:", JSON.stringify(rows))
    check(
      rows.every((r) => !r.name.includes("(you)")),
      "nobody is labelled (you)"
    )
    check(
      rows.find((r) => r.name === "Alice")?.hinted === true && rows.find((r) => r.name !== "Alice")?.hinted === false,
      "the reveal marks who used a hint"
    )
    return { aliceRevealPage, bobRevealPage }
  })

  // Everyone's paint shows together; Bob hovers Alice's name, then looks at her paint alone, hides all, and brings it back.
  await test.step("Bob views everyone's paint, then Alice's alone, then hides it", async () => {
    const everyone = await bobRevealPage.map.shownPaintCells()
    await bobRevealPage.screenshot(shot(`mp-3b-reveal-everyone.png`))
    await bobRevealPage.hoverPlayer("Alice")
    const hoveringAlice = await bobRevealPage.map.shownPaintCells()
    await bobRevealPage.stopHovering()
    const afterHover = await bobRevealPage.map.shownPaintCells()
    check(
      hoveringAlice > 0 && hoveringAlice < everyone && afterHover === everyone,
      `hovering Alice's name shows her paint alone (${hoveringAlice} cells), then everyone's again (${afterHover})`
    )
    await bobRevealPage.showOnly("Alice")
    const alicesOnly = await bobRevealPage.map.shownPaintCells()
    check(alicesOnly > 0 && alicesOnly < everyone, `Alice's paint alone (${alicesOnly} of ${everyone} cells)`)
    await bobRevealPage.screenshot(shot(`mp-4-reveal-bob-views-alice.png`))
    await bobRevealPage.toggleHidePaint()
    check((await bobRevealPage.map.shownPaintCells()) === 0, "Hide paint hides all paint")
    await bobRevealPage.screenshot(shot(`mp-4b-reveal-hidden.png`))
    await bobRevealPage.toggleHidePaint()
    check((await bobRevealPage.map.shownPaintCells()) === everyone, "clicking it again brings everyone's back")
  })

  // Bob is ready, Alice (the host) is not, so nothing moves until she is.
  await test.step("round 2 starts once everyone is ready", async () => {
    await bobRevealPage.ready()
    await aliceRevealPage.waitForReadyCount("1 of 2 ready")
    await aliceRevealPage.pause(800)
    check(await aliceRevealPage.isStillShown(), "still on the reveal with one of two ready")
    await aliceRevealPage.screenshot(shot(`mp-5-reveal-one-ready.png`))
    const aliceRound2Page = await aliceRevealPage.readyLast()
    check((await aliceRound2Page.hud.round()) === "Round 2 / 3", "round 2 starts once everyone is ready")
    check((await aliceRound2Page.map.shownHintShapes()) === 0, "round 2 starts without round 1's band")
    check(!(await aliceRound2Page.canUseHint()), "Alice has no hints left")
  })
})
