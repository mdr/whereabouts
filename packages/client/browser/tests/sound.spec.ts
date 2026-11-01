// The game's sounds start and stop when they should, against the dev
// servers: the rising cue at round start, the spray while painting and the
// eraser while erasing, the whoosh for Clear, the chicken for a pass, the
// countdown at ten seconds left, the falling cue and no alarm when everyone
// finishes early, the alarm when time runs out, applause at the final
// results, and silence with the switch off.
import { test } from "@playwright/test"
import { Tool } from "../../src/paint/tool.ts"
import {
  collectUntilPlayed,
  cueNotes,
  pageTime,
  played,
  recordSounds,
  stopped,
  takeSounds,
  type SoundEvent
} from "./sounds.ts"
import { check, newTab, SWIFTSHADER } from "./support.ts"

test.use({ launchOptions: { args: [...SWIFTSHADER, "--autoplay-policy=no-user-gesture-required"] } })

test("sound", async ({ browser }) => {
  const options = { context: { viewport: { width: 1280, height: 800 } }, initScript: recordSounds }
  const spot = { across: 0.47, down: 0.5 }

  const { annTab, bobTab, annLobbyPage, bobLobbyPage } = await test.step("Ann hosts and Bob joins", async () => {
    const annTab = await newTab(browser, "Ann", options)
    const annHomePage = await annTab.openHome()
    await annHomePage.enterName("Ann")
    const annLobbyPage = await annHomePage.hostGame()
    const code = await annLobbyPage.code()
    const bobTab = await newTab(browser, "Bob", options)
    const bobJoinAsPage = await bobTab.openGameLink(code)
    await bobJoinAsPage.enterName("Bob")
    const bobLobbyPage = await bobJoinAsPage.join()
    await annLobbyPage.players.waitForPlayer("Bob")
    await takeSounds(annTab)
    await takeSounds(bobTab)
    return { annTab, bobTab, annLobbyPage, bobLobbyPage }
  })

  // Both hear the rising pair, low note first.
  const { startedAt, annRoundPage, bobRoundPage, sinceStart } =
    await test.step("round 1 starts with the rising cue", async () => {
      const startedAt = await pageTime(annTab)
      const annRoundPage = await annLobbyPage.startGame()
      const bobRoundPage = await bobLobbyPage.waitForGameToStart()
      const sinceStart = await takeSounds(annTab)
      for (const [name, notes] of [
        ["Ann", cueNotes(sinceStart)],
        ["Bob", cueNotes(await takeSounds(bobTab))]
      ] as const) {
        check(notes.length === 2 && notes[0]! < notes[1]!, `${name} hears the round-start cue ${JSON.stringify(notes)}`)
      }
      return { startedAt, annRoundPage, bobRoundPage, sinceStart }
    })

  // A held stroke sprays; erasing does not.
  await test.step("painting sprays, erasing rubs the eraser", async () => {
    await annRoundPage.map.drag(spot, { distance: 90, steps: 30, hold: 1500 })
    let events = await takeSounds(annTab)
    sinceStart.push(...events)
    check(played(events, "spray"), "a held stroke plays the spray")
    check(stopped(events, "spray"), "letting go stops the spray")
    await annRoundPage.paintTools.selectTool(Tool.ERASE)
    await annRoundPage.map.drag(spot, { distance: 50, steps: 16, hold: 800 })
    events = await takeSounds(annTab)
    sinceStart.push(...events)
    check(played(events, "eraser") && !played(events, "spray"), "erasing rubs the eraser, not the spray")
    await annRoundPage.paintTools.selectTool(Tool.PAINT)
  })

  // Clear whooshes when there is paint to wipe; Undo brings it back for Done below.
  await test.step("Clear whooshes", async () => {
    await annRoundPage.paintTools.clear()
    const events = await takeSounds(annTab)
    sinceStart.push(...events)
    check(played(events, "clear"), "Clear plays the whoosh")
    await annRoundPage.paintTools.undoWithKeyboard()
  })

  // The round is 12 s, so the countdown should start about 2 s after Start.
  await test.step("the countdown starts at ten seconds left", async () => {
    await collectUntilPlayed(annTab, sinceStart, "countdown")
    const ticks = sinceStart.filter((event) => event.kind === "buffer" && event.clip === "countdown")
    const tickAt = ticks.map((event) => `${((event.at - startedAt) / 1000).toFixed(1)} s`)
    check(
      ticks.length === 1 && Math.abs((ticks[0]!.at - startedAt) / 1000 - 2) < 1,
      `the countdown starts at ten seconds left (${tickAt.join(", ") || "never"} after Start)`
    )
    await takeSounds(bobTab)
  })

  // Everyone done early: the falling pair, and the countdown stops before its alarm.
  const { annRevealPage, bobRevealPage } =
    await test.step("everyone finishes early: a pass chickens, the falling cue plays", async () => {
      check((await bobRoundPage.doneButtonLabel()) === "Pass", "Bob has nothing painted, so he can pass")
      const bobRoundDonePage = await bobRoundPage.finish()
      check(played(await takeSounds(bobTab), "chicken"), "passing plays the chicken")
      const annRevealPage = await annRoundPage.finishLast()
      const events = await takeSounds(annTab)
      const falling = cueNotes(events)
      check(
        falling.length === 2 && falling[0]! > falling[1]!,
        `finishing early plays the falling cue ${JSON.stringify(falling)}`
      )
      check(stopped(events, "countdown"), "finishing early stops the countdown")
      const bobRevealPage = await bobRoundDonePage.waitForReveal()
      return { annRevealPage, bobRevealPage }
    })

  // The countdown plays through to its alarm, and no falling cue.
  const { annReveal2Page, bobReveal2Page } = await test.step("round 2 runs out of time: the alarm plays", async () => {
    const annRound2Page = await annRevealPage.nextRound()
    const bobRound2Page = await bobRevealPage.waitForNextRound()
    await takeSounds(annTab)
    const annReveal2Page = await annRound2Page.waitForReveal()
    const events = await takeSounds(annTab)
    check(cueNotes(events).length === 0, `running out of time plays no falling cue ${JSON.stringify(cueNotes(events))}`)
    check(!stopped(events, "countdown"), "the alarm is left to play")
    const bobReveal2Page = await bobRound2Page.waitForReveal()
    return { annReveal2Page, bobReveal2Page }
  })

  await test.step("the final results play applause for everyone", async () => {
    await annReveal2Page.showFinalResults()
    await bobReveal2Page.waitForResults()
    const annHeard: SoundEvent[] = []
    await collectUntilPlayed(annTab, annHeard, "applause")
    check(played(annHeard, "applause"), "Ann hears applause at the final results")
    check(played(await takeSounds(bobTab), "applause"), "Bob hears it too")
  })

  // In practice mode.
  await test.step("with the switch off, painting is silent", async () => {
    const soloTab = await newTab(browser, "solo", options)
    const practiceRoundPage = await soloTab.openPractice()
    await practiceRoundPage.hud.toggleSound()
    await takeSounds(soloTab)
    await practiceRoundPage.map.drag(spot, { distance: 80, steps: 10, hold: 600 })
    check(!(await takeSounds(soloTab)).some((event) => event.kind === "buffer"), "with sounds off, painting is silent")
    await practiceRoundPage.hud.toggleSound()
    await practiceRoundPage.map.drag({ across: 0.4, down: 0.4 }, { distance: 60, steps: 10, hold: 600 })
    check(played(await takeSounds(soloTab), "spray"), "switched back on, practice sprays")
  })
})
