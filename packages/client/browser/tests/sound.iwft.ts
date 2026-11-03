// The game's sounds start and stop when they should, against the in-process
// server: the rising cue at round start, the spray while painting and the
// eraser while erasing, the whoosh for Clear, the chicken for a pass, the
// countdown at ten seconds left, the falling cue and no alarm when everyone
// finishes early, the alarm when time runs out, applause at the final
// results, and silence with the switch off.
import { ROUND_GRACE } from "@whereabouts/shared/game/game"
import { evenMix } from "@whereabouts/shared/protocol/config"
import { test } from "../game-server/game-server.ts"
import { Tool } from "../../src/paint/tool.ts"
import { pageTime, recordSounds, Sounds } from "./sounds.ts"
import { newOfflineTab, newTab } from "./iwft-tab.ts"
import { SWIFTSHADER } from "./support.ts"

// The countdown starts ten seconds before the end of a long round; Ann's page clock is wound on to there.
const ROUND_LENGTH = 120_000
const COUNTDOWN_AT = ROUND_LENGTH - 10_000

test.use({
  launchOptions: { args: [...SWIFTSHADER, "--autoplay-policy=no-user-gesture-required"] },
  serverOptions: { config: { mix: evenMix(2), roundLength: ROUND_LENGTH } }
})

test("sound", async ({ browser, game }) => {
  const options = { context: { viewport: { width: 1280, height: 800 } }, initScript: recordSounds }
  const spot = { across: 0.47, down: 0.5 }

  const { annTab, annSounds, bobSounds, annLobbyPage, bobLobbyPage } =
    await test.step("Ann hosts and Bob joins", async () => {
      const annTab = await newTab(browser, "Ann", { ...options, game })
      await annTab.installClock()
      const annHomePage = await annTab.openHome()
      await annHomePage.enterName("Ann")
      const annLobbyPage = await annHomePage.hostGame()
      const code = await annLobbyPage.code()
      const bobTab = await newTab(browser, "Bob", { ...options, game })
      const bobJoinAsPage = await bobTab.openGameLink(code)
      await bobJoinAsPage.enterName("Bob")
      const bobLobbyPage = await bobJoinAsPage.join()
      await annLobbyPage.players.waitForPlayer("Bob")
      return { annTab, annSounds: new Sounds(annTab), bobSounds: new Sounds(bobTab), annLobbyPage, bobLobbyPage }
    })

  // Both hear the rising pair, low note first.
  const { startedAt, annRoundPage, bobRoundPage, annSinceStart } =
    await test.step("round 1 starts with the rising cue", async () => {
      const annSinceStart = await annSounds.listen()
      const bobSinceStart = await bobSounds.listen()
      const startedAt = await pageTime(annTab)
      const annRoundPage = await annLobbyPage.startGame()
      const bobRoundPage = await bobLobbyPage.waitForGameToStart()
      await annSinceStart.expectRisingCue("Ann hears the rising round-start cue")
      await bobSinceStart.expectRisingCue("Bob hears the rising round-start cue")
      return { startedAt, annRoundPage, bobRoundPage, annSinceStart }
    })

  // A held stroke sprays; erasing does not.
  await test.step("painting sprays, erasing rubs the eraser", async () => {
    const painting = await annSounds.listen()
    await annRoundPage.map.drag(spot, { distance: 90, steps: 30, hold: 1500 })
    await painting.expectPlayed("spray", "a held stroke plays the spray")
    await painting.expectStopped("spray", "letting go stops the spray")
    await annRoundPage.paintTools.selectTool(Tool.ERASE)
    const erasing = await annSounds.listen()
    await annRoundPage.map.drag(spot, { distance: 50, steps: 16, hold: 800 })
    await erasing.expectPlayed("eraser", "erasing rubs the eraser")
    await erasing.expectNotPlayed("spray")
    await annRoundPage.paintTools.selectTool(Tool.PAINT)
  })

  // Clear whooshes when there is paint to wipe; Undo brings it back for Done below.
  await test.step("Clear whooshes", async () => {
    const clearing = await annSounds.listen()
    await annRoundPage.paintTools.clear()
    await clearing.expectPlayed("clear", "Clear plays the whoosh")
    await annRoundPage.paintTools.undoWithKeyboard()
  })

  await test.step("the countdown starts at ten seconds left", async () => {
    const elapsed = (await pageTime(annTab)) - startedAt
    await annTab.fastForward(COUNTDOWN_AT - elapsed + 200)
    await annSinceStart.expectCountdownStart(startedAt, COUNTDOWN_AT / 1000 + 0.5)
  })

  // Everyone done early: the falling pair, and the countdown stops before its alarm.
  const { annRevealPage, bobRevealPage } =
    await test.step("everyone finishes early: a pass chickens, the falling cue plays", async () => {
      await bobRoundPage.expectDoneLabel("Pass")
      const bobPassing = await bobSounds.listen()
      const bobRoundDonePage = await bobRoundPage.finish()
      await bobPassing.expectPlayed("chicken", "passing plays the chicken")
      const annFinishing = await annSounds.listen()
      const annRevealPage = await annRoundPage.finishLast()
      await annFinishing.expectFallingCue("finishing early plays the falling cue")
      await annFinishing.expectStopped("countdown", "finishing early stops the countdown")
      const bobRevealPage = await bobRoundDonePage.waitForReveal()
      return { annRevealPage, bobRevealPage }
    })

  // The countdown plays through to its alarm, and no falling cue.
  const { annReveal2Page, bobReveal2Page } = await test.step("round 2 runs out of time: the alarm plays", async () => {
    const annRound2Page = await annRevealPage.nextRound()
    const bobRound2Page = await bobRevealPage.waitForNextRound()
    const annRound2 = await annSounds.listen()
    await annTab.fastForward(COUNTDOWN_AT + 1_000)
    game.advance(ROUND_LENGTH + ROUND_GRACE)
    const annReveal2Page = await annRound2Page.waitForReveal()
    await annRound2.expectNoCue()
    await annRound2.expectNotStopped("countdown")
    const bobReveal2Page = await bobRound2Page.waitForReveal()
    return { annReveal2Page, bobReveal2Page }
  })

  await test.step("the final results play applause for everyone", async () => {
    const annResults = await annSounds.listen()
    const bobResults = await bobSounds.listen()
    await annReveal2Page.showFinalResults()
    await bobReveal2Page.waitForResults()
    await annResults.expectPlayed("applause", "Ann hears applause at the final results")
    await bobResults.expectPlayed("applause", "Bob hears applause at the final results")
  })

  // In practice mode.
  await test.step("with the switch off, painting is silent", async () => {
    const soloTab = await newOfflineTab(browser, "solo", options)
    const soloSounds = new Sounds(soloTab)
    const practiceRoundPage = await soloTab.openPractice()
    await practiceRoundPage.hud.expectSound(true)
    await practiceRoundPage.hud.toggleSound()
    await practiceRoundPage.hud.expectSound(false)
    const switchedOff = await soloSounds.listen()
    await practiceRoundPage.map.drag(spot, { distance: 80, steps: 10, hold: 600 })
    await switchedOff.expectSilent()
    await practiceRoundPage.hud.toggleSound()
    await practiceRoundPage.hud.expectSound(true)
    const switchedOn = await soloSounds.listen()
    await practiceRoundPage.map.drag({ across: 0.4, down: 0.4 }, { distance: 60, steps: 10, hold: 600 })
    await switchedOn.expectPlayed("spray", "switched back on, practice sprays")
  })
})
