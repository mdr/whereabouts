// An online game with the host in VR, on an emulated Quest 3 (see
// pages/Headset.ts), and a second player on the page: the clock, Pass and
// Done, Keep editing, the reveal's score table and Ready, the host's Next,
// and the final standings, awards and rounds, all in the headset from the
// lobby on. Saves screenshots.
// Usage, from packages/client: node browser/e2e/vr-multiplayer.ts [outDir] [baseUrl]
import { Headset } from "../pages/Headset.ts"
import { vrButtonTestIds } from "../../src/ui/VrButtonTestIds.ts"
import { until } from "../pages/support.ts"
import { Checks, launchChrome, newTab, outDir } from "./support.ts"

const out = outDir()
const checks = new Checks()
const browser = await launchChrome()
const baseUrl = process.argv[3]

const aliceTab = await newTab(browser, "Alice", { context: { viewport: { width: 1200, height: 800 } }, baseUrl })
const headset = await Headset.install(aliceTab.page)
const aliceHome = await aliceTab.openHome()
await aliceHome.enterName("Alice")
const aliceLobby = await aliceHome.hostGame()
const code = await aliceLobby.code()
const bobHome = await (await newTab(browser, "Bob", { baseUrl })).openHome()
await bobHome.enterName("Bob")
const bobLobby = await bobHome.joinGame(code)
await aliceLobby.players.waitForPlayer("Bob", 5_000)
await aliceLobby.setOnlyQuestions("places", 2)
await aliceLobby.chooseSecondsPerRound(60)

// The host goes into VR in the lobby, and starts the game from there.
await aliceTab.page.getByTestId(vrButtonTestIds.button).click()
await until(
  "the headset session",
  () => headset.inSession(),
  (on) => on,
  60_000
)
const lobby = await until(
  "the lobby in VR",
  () => headset.view(),
  (v) => v === "lobby"
)
const lobbyTable = await until(
  "the players in VR",
  () => headset.scoreTable(),
  (t) => t?.rows.length === 2
)
checks.check(
  lobby === "lobby" && lobbyTable?.rows.length === 2,
  `the lobby opens VR, listing the players (${JSON.stringify(lobbyTable?.rows.map((r) => r.name))})`
)
const [x, y, z] = await headset.eyes()
const centre: [number, number, number] = [x, y - 0.3, z - 0.67]
const can: [number, number, number] = [x + 0.15, y - 0.25, z - 0.15]
const wait = (ms: number) => aliceTab.page.waitForTimeout(ms)
/** Points at a menu button and pulls the trigger. */
async function press(id: string): Promise<void> {
  await headset.press(can, await headset.menuButton(id))
}
await wait(1500)
await aliceLobby.screenshot(`${out}/vrmp-0-lobby.png`)
await press("act0")
const aliceRound = await aliceLobby.waitForGameToStart()
const bobRound = await bobLobby.waitForGameToStart()
checks.check(
  (await until(
    "round 1 in VR",
    () => headset.view(),
    (v) => v === "paint",
    30_000
  )) === "paint" && (await headset.inSession()),
  "Start game in VR starts it, the headset still on"
)
const clock = await until(
  "the clock in VR",
  async () => (await headset.menu()).clock,
  (c) => /^\d:\d\d left$/.test(c)
)
checks.check(/^\d:\d\d left$/.test(clock), `the menu counts down the round (${clock})`)
checks.check((await headset.doneLabel()) === "Pass", "with nothing painted, Done says Pass")

// While guessing: which round, the players beside the globe, and the host's buttons.
const guessing = await headset.menu()
const players = await until(
  "the players beside the globe",
  () => headset.scoreTable(),
  (t) => t?.title === "Players"
)
checks.check(
  guessing.heading === "ROUND 1 OF 2" && players?.rows.map((r) => r.detail).join() === "guessing,guessing",
  `the menu says which round, and the table who is still guessing (${guessing.heading}; ${JSON.stringify(players?.rows)})`
)
const moreLabels = () => headset.menu().then((m) => m.more.map((a) => a.label))
checks.check(
  (await moreLabels()).join() === "End game,Leave game",
  `the host can end the game or leave it (${(await moreLabels()).join(", ")})`
)
await press("more0")
checks.check((await moreLabels())[0] === "Press again to end the game", "End game asks for a second press")
checks.check(
  (await until("End game to settle back", moreLabels, (l) => l[0] === "End game")).length > 0,
  "and without one it lets the game go on"
)
const bobRow = async () => {
  const i = (await headset.scoreTable())!.rows.findIndex((r) => r.name === "Bob")
  await headset.press(can, await headset.scoreRow(i))
}
await bobRow()
const picked = await until("Bob picked", moreLabels, (l) => l.includes("Remove Bob"))
checks.check(
  picked.join() === "Remove Bob,Make Bob host,End game,Leave game",
  `pointing at Bob's row offers to remove him or make him host (${picked.join(", ")})`
)
await bobRow()
await until("Bob let go", moreLabels, (l) => !l.includes("Remove Bob"))

await headset.pointRight(can, centre)
await aliceRound.pause(300)
await headset.rightTrigger(1)
for (let i = 0; i < 10; i++) {
  await headset.pointRight(can, [centre[0] + 0.01 * i, centre[1], centre[2]])
  await aliceRound.pause(100)
}
await headset.rightTrigger(0)
const done = await until(
  "Done on the menu",
  () => headset.doneLabel(),
  (l) => l === "Done"
)
checks.check(done === "Done", "with paint down, it says Done")
await aliceRound.screenshot(`${out}/vrmp-1-painted.png`)

await press("done")
checks.check(
  await until(
    "Keep editing",
    async () => (await headset.menu()).unlock,
    (on) => on
  ),
  "Done in VR locks the guess in, and offers Keep editing"
)
await press("unlock")
checks.check(
  !(await until(
    "painting again",
    async () => (await headset.menu()).unlock,
    (on) => !on
  )),
  "Keep editing unlocks it"
)
await press("done")
await until(
  "locked again",
  async () => (await headset.menu()).unlock,
  (on) => on
)
await bobRound.map.drag({ across: 0.3, down: 0.55 })
const bobReveal = await bobRound.finishLast()

const reveal = await until(
  "the answer in VR",
  () => headset.view(),
  (v) => v === "reveal"
)
checks.check(reveal === "reveal", "the reveal comes to the headset")
const table = await until(
  "the round's scores",
  () => headset.scoreTable(),
  (t) => t?.rows.length === 4
)
checks.check(
  table?.title === "Round 1 of 2" && table.rows.some((r) => r.name === "Alice (you)"),
  `the score table lists both players (${JSON.stringify(table?.rows.map((r) => r.name))})`
)

// The table's rows pick whose paint the globe shows, as the page's do.
const everyone = await until(
  "everyone's paint",
  () => headset.globePaintCells(),
  (n) => n > 0
)
const pick = async (name: string, ok: (cells: number) => boolean) => {
  const i = (await headset.scoreTable())!.rows.findIndex((r) => r.name === name)
  await headset.press(can, await headset.scoreRow(i))
  const cells = await until(`${name}'s paint`, () => headset.globePaintCells(), ok)
  const row = (await headset.scoreTable())!.rows[i]!
  return { cells, selected: row.selected === true }
}
const alone = await pick("Alice (you)", (n) => n > 0 && n < everyone)
await aliceRound.pause(500)
await aliceRound.screenshot(`${out}/vrmp-2a-alone.png`)
checks.check(alone.selected, `pointing at Alice's row shows her paint alone (${alone.cells} of ${everyone} cells)`)
const hidden = await pick("Hide paint", (n) => n === 0)
checks.check(hidden.selected, "Hide paint hides all paint")
const back = await pick("Everyone", (n) => n === everyone)
checks.check(back.selected, "Everyone brings it all back")

const why = (await headset.menu()).why
checks.check((why ?? "").length > 20, `the reveal says why Alice scored what she did (${why})`)
const actions = (await headset.menu()).actions.map((a) => a.label)
checks.check(actions.join() === "Ready,Next round", `the host is offered Ready and Next round (${actions.join(", ")})`)
await aliceRound.pause(1500)
await aliceRound.screenshot(`${out}/vrmp-2-reveal.png`)
await press("act0")
const ready = await until(
  "ready",
  async () => (await headset.menu()).actions[0],
  (a) => a?.enabled === false
)
checks.check(ready?.label === "Waiting for the others", "Ready in VR readies the host")

await press("act1")
checks.check(
  (await until(
    "round 2 in VR",
    () => headset.view(),
    (v) => v === "paint"
  )) === "paint",
  "the host's Next round brings round 2 to the headset"
)
await until(
  "Pass on the menu",
  () => headset.doneLabel(),
  (l) => l === "Pass"
)
await press("done")
const bobRound2 = await bobReveal.waitForNextRound()
await bobRound2.finishLast()
await until(
  "round 2's answer in VR",
  () => headset.view(),
  (v) => v === "reveal"
)
const last = (await headset.menu()).actions.map((a) => a.label)
checks.check(last.includes("Show final results"), `the last round offers the final results (${last.join(", ")})`)
await press("act1")
const final = await until(
  "the final standings in VR",
  () => headset.view(),
  (v) => v === "done"
)
const standings = await headset.scoreTable()
checks.check(
  final === "done" && standings?.title === "Standings" && standings.rows.length === 2,
  `the final standings show in the headset (${JSON.stringify(standings?.rows.map((r) => r.name))})`
)
checks.check(
  (await headset.menu()).actions.map((a) => a.label).join() === "Play again",
  "and the host can play again from there"
)
const board = await until(
  "the results board",
  () => headset.board(),
  (b) => b !== undefined
)
checks.check(
  board?.rounds.length === 2,
  `a board shows the awards and every round (${board?.awards.map((a) => a.title).join(", ")}; ${board?.rounds.length} rounds)`
)
await aliceRound.pause(1500)
await aliceRound.screenshot(`${out}/vrmp-3-standings.png`)

await browser.close()
checks.finish()
