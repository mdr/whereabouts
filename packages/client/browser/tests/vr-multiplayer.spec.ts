// An online game with the host in VR, on an emulated Quest 3 (see
// pages/Headset.ts), and a second player on the page: the clock, Pass and
// Done, Keep editing, the reveal's score table and Ready, the host's Next,
// and the final standings, awards and rounds, all in the headset from the
// lobby on. Saves screenshots.
import { test } from "@playwright/test"
import { Headset } from "../pages/Headset.ts"
import { vrButtonTestIds } from "../../src/ui/VrButtonTestIds.ts"
import { until } from "../pages/support.ts"
import { VrViewType } from "../../src/vr/view.ts"
import { QuestionType } from "@whereabouts/shared/questions"
import { check, newTab, shot } from "./support.ts"

test("vr-multiplayer", async ({ browser }) => {
  const aliceTab = await newTab(browser, "Alice", { context: { viewport: { width: 1200, height: 800 } } })
  const headset = await Headset.install(aliceTab.page)
  const aliceHome = await aliceTab.openHome()
  await aliceHome.enterName("Alice")
  const aliceLobby = await aliceHome.hostGame()
  const code = await aliceLobby.code()
  const bobHome = await (await newTab(browser, "Bob")).openHome()
  await bobHome.enterName("Bob")
  const bobLobby = await bobHome.joinGame(code)
  await aliceLobby.players.waitForPlayer("Bob", 5_000)
  await aliceLobby.setOnlyQuestions(QuestionType.PLACE, 2)
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
    (v) => v === VrViewType.LOBBY
  )
  const lobbyTable = await until(
    "the players in VR",
    () => headset.scoreTable(),
    (t) => t?.rows.length === 2
  )
  check(
    lobby === VrViewType.LOBBY && lobbyTable?.rows.length === 2,
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
  await aliceLobby.screenshot(shot(`vrmp-0-lobby.png`))
  await press("act0")
  const aliceRound = await aliceLobby.waitForGameToStart()
  const bobRound = await bobLobby.waitForGameToStart()
  check(
    (await until(
      "round 1 in VR",
      () => headset.view(),
      (v) => v === VrViewType.PAINT,
      30_000
    )) === VrViewType.PAINT && (await headset.inSession()),
    "Start game in VR starts it, the headset still on"
  )
  const clock = await until(
    "the clock in VR",
    async () => (await headset.menu()).clock,
    (c) => /^\d:\d\d left$/.test(c)
  )
  check(/^\d:\d\d left$/.test(clock), `the menu counts down the round (${clock})`)
  check((await headset.doneLabel()) === "Pass", "with nothing painted, Done says Pass")

  // While guessing: which round, the players beside the globe, and the host's buttons.
  const guessing = await headset.menu()
  const players = await until(
    "the players beside the globe",
    () => headset.scoreTable(),
    (t) => t?.title === "Players"
  )
  check(
    guessing.heading === "ROUND 1 OF 2" && players?.rows.map((r) => r.detail).join() === "guessing,guessing",
    `the menu says which round, and the table who is still guessing (${guessing.heading}; ${JSON.stringify(players?.rows)})`
  )
  const moreLabels = () => headset.menu().then((m) => m.more.map((a) => a.label))
  check(
    (await moreLabels()).join() === "End game,Leave game",
    `the host can end the game or leave it (${(await moreLabels()).join(", ")})`
  )
  await press("more0")
  check((await moreLabels())[0] === "Press again to end the game", "End game asks for a second press")
  check(
    (await until("End game to settle back", moreLabels, (l) => l[0] === "End game")).length > 0,
    "and without one it lets the game go on"
  )
  const bobRow = async () => {
    const i = (await headset.scoreTable())!.rows.findIndex((r) => r.name === "Bob")
    await headset.press(can, await headset.scoreRow(i))
  }
  await bobRow()
  const picked = await until("Bob picked", moreLabels, (l) => l.includes("Remove Bob"))
  check(
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
  check(done === "Done", "with paint down, it says Done")
  await aliceRound.screenshot(shot(`vrmp-1-painted.png`))

  await press("done")
  check(
    await until(
      "Keep editing",
      async () => (await headset.menu()).unlock,
      (on) => on
    ),
    "Done in VR locks the guess in, and offers Keep editing"
  )
  await press("unlock")
  check(
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
    (v) => v === VrViewType.REVEAL
  )
  check(reveal === VrViewType.REVEAL, "the reveal comes to the headset")
  const table = await until(
    "the round's scores",
    () => headset.scoreTable(),
    (t) => t?.rows.length === 4
  )
  check(
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
  await aliceRound.screenshot(shot(`vrmp-2a-alone.png`))
  check(alone.selected, `pointing at Alice's row shows her paint alone (${alone.cells} of ${everyone} cells)`)
  const hidden = await pick("Hide paint", (n) => n === 0)
  check(hidden.selected, "Hide paint hides all paint")
  const back = await pick("Everyone", (n) => n === everyone)
  check(back.selected, "Everyone brings it all back")

  const actions = (await headset.menu()).actions.map((a) => a.label)
  check(actions.join() === "Ready,Next round", `the host is offered Ready and Next round (${actions.join(", ")})`)
  await aliceRound.pause(1500)
  await aliceRound.screenshot(shot(`vrmp-2-reveal.png`))
  await press("act0")
  const ready = await until(
    "ready",
    async () => (await headset.menu()).actions[0],
    (a) => a?.enabled === false
  )
  check(ready?.label === "Waiting for the others…", "Ready in VR readies the host")

  await press("act1")
  check(
    (await until(
      "round 2 in VR",
      () => headset.view(),
      (v) => v === VrViewType.PAINT
    )) === VrViewType.PAINT,
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
    (v) => v === VrViewType.REVEAL
  )
  const last = (await headset.menu()).actions.map((a) => a.label)
  check(last.includes("Show final results"), `the last round offers the final results (${last.join(", ")})`)
  await press("act1")
  const final = await until(
    "the final standings in VR",
    () => headset.view(),
    (v) => v === VrViewType.DONE
  )
  const standings = await headset.scoreTable()
  check(
    final === VrViewType.DONE && standings?.title === "Standings" && standings.rows.length === 2,
    `the final standings show in the headset (${JSON.stringify(standings?.rows.map((r) => r.name))})`
  )
  check(
    (await headset.menu()).actions.map((a) => a.label).join() === "Play again",
    "and the host can play again from there"
  )
  const board = await until(
    "the results board",
    () => headset.board(),
    (b) => b !== undefined
  )
  check(
    board?.rounds.length === 2,
    `a board shows the awards and every round (${board?.awards.map((a) => a.title).join(", ")}; ${board?.rounds.length} rounds)`
  )
  const zoomedOut = await until(
    "the globe back to its starting size",
    () => headset.globeScale(),
    (s) => s < 1.01
  )
  check(zoomedOut < 1.01, `leaving the answer zooms the globe back out (${zoomedOut.toFixed(2)})`)
  await aliceRound.pause(1500)
  await aliceRound.screenshot(shot(`vrmp-3-standings.png`))
})
