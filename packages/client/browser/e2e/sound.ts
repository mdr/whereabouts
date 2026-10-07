// The game's sounds start and stop when they should, against the dev
// servers: the rising cue at round start, the spray while painting and the
// eraser while erasing, the whoosh for Clear, the chicken for a pass, the
// countdown at ten seconds left, the falling cue and no alarm when everyone
// finishes early, the alarm when time runs out, applause at the final
// results, and silence with the switch off.
// Run the game server with ROUND_MS=12000 ROUNDS=2.
// Usage, from packages/client: node browser/e2e/sound.ts
import { Checks, launchChrome, newTab } from "./support.ts"
import { cueNotes, pageTime, played, recordSounds, stopped, takeSounds } from "./sounds.ts"

const checks = new Checks()
const browser = await launchChrome(["--autoplay-policy=no-user-gesture-required"])
const options = { context: { viewport: { width: 1280, height: 800 } }, initScript: recordSounds }
const spot = { across: 0.47, down: 0.5 }

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

// Round 1 starts: both hear the rising pair, low note first.
const startedAt = await pageTime(annTab)
const annRoundPage = await annLobbyPage.startGame()
const bobRoundPage = await bobLobbyPage.waitForGameToStart()
const sinceStart = await takeSounds(annTab)
for (const [name, notes] of [
  ["Ann", cueNotes(sinceStart)],
  ["Bob", cueNotes(await takeSounds(bobTab))]
] as const) {
  checks.check(
    notes.length === 2 && notes[0]! < notes[1]!,
    `${name} hears the round-start cue ${JSON.stringify(notes)}`
  )
}

// A held stroke sprays; erasing does not.
await annRoundPage.map.drag(spot, { distancePx: 90, steps: 30, holdMs: 1500 })
let events = await takeSounds(annTab)
sinceStart.push(...events)
checks.check(played(events, "spray"), "a held stroke plays the spray")
checks.check(stopped(events, "spray"), "letting go stops the spray")
await annRoundPage.paintTools.selectTool("erase")
await annRoundPage.map.drag(spot, { distancePx: 50, steps: 16, holdMs: 800 })
events = await takeSounds(annTab)
sinceStart.push(...events)
checks.check(played(events, "eraser") && !played(events, "spray"), "erasing rubs the eraser, not the spray")
await annRoundPage.paintTools.selectTool("paint")

// Clear whooshes when there is paint to wipe; Undo brings it back for Done below.
await annRoundPage.paintTools.clear()
events = await takeSounds(annTab)
sinceStart.push(...events)
checks.check(played(events, "clear"), "Clear plays the whoosh")
await annRoundPage.paintTools.undoWithKeyboard()

// The round is 12 s, so the countdown should start about 2 s after Start.
await annRoundPage.pause(1000)
sinceStart.push(...(await takeSounds(annTab)))
const ticks = sinceStart.filter((e) => e.kind === "buffer" && e.clip === "countdown")
const tickAt = ticks.map((e) => `${((e.at - startedAt) / 1000).toFixed(1)} s`)
checks.check(
  ticks.length === 1 && Math.abs((ticks[0]!.at - startedAt) / 1000 - 2) < 1,
  `the countdown starts at ten seconds left (${tickAt.join(", ") || "never"} after Start)`
)
await takeSounds(bobTab)

// Everyone done early: the falling pair, and the countdown stops before its alarm.
checks.check((await bobRoundPage.doneButtonLabel()) === "Pass", "Bob has nothing painted, so he can pass")
const bobRoundDonePage = await bobRoundPage.finish()
checks.check(played(await takeSounds(bobTab), "chicken"), "passing plays the chicken")
const annRevealPage = await annRoundPage.finishLast()
events = await takeSounds(annTab)
const falling = cueNotes(events)
checks.check(
  falling.length === 2 && falling[0]! > falling[1]!,
  `finishing early plays the falling cue ${JSON.stringify(falling)}`
)
checks.check(stopped(events, "countdown"), "finishing early stops the countdown")
const bobRevealPage = await bobRoundDonePage.waitForReveal()

// Round 2 runs out of time: the countdown plays through to its alarm, and no falling cue.
const annRound2Page = await annRevealPage.nextRound()
const bobRound2Page = await bobRevealPage.waitForNextRound()
await takeSounds(annTab)
const annReveal2Page = await annRound2Page.waitForReveal()
events = await takeSounds(annTab)
checks.check(
  cueNotes(events).length === 0,
  `running out of time plays no falling cue ${JSON.stringify(cueNotes(events))}`
)
checks.check(!stopped(events, "countdown"), "the alarm is left to play")
const bobReveal2Page = await bobRound2Page.waitForReveal()

// The final results: applause for everyone.
const annResultsPage = await annReveal2Page.showFinalResults()
await bobReveal2Page.waitForResults()
await annResultsPage.pause(400)
checks.check(played(await takeSounds(annTab), "applause"), "Ann hears applause at the final results")
checks.check(played(await takeSounds(bobTab), "applause"), "Bob hears it too")

// With the switch off, painting is silent (in practice mode).
const soloTab = await newTab(browser, "solo", options)
const practiceRoundPage = await soloTab.openPractice()
await practiceRoundPage.hud.toggleSound()
await takeSounds(soloTab)
await practiceRoundPage.map.drag(spot, { distancePx: 80, steps: 10, holdMs: 600 })
checks.check(!(await takeSounds(soloTab)).some((e) => e.kind === "buffer"), "with sounds off, painting is silent")
await practiceRoundPage.hud.toggleSound()
await practiceRoundPage.map.drag({ across: 0.4, down: 0.4 }, { distancePx: 60, steps: 10, holdMs: 600 })
checks.check(played(await takeSounds(soloTab), "spray"), "switched back on, practice sprays")

await browser.close()
checks.finish()
