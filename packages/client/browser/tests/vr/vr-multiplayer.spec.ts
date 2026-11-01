// An online game with the host in VR, on an emulated Quest 3 (see
// pages/headset/Headset.ts), and a second player on the page: starting from the lobby
// in VR, the clock and the host's controls, Pass, Done and Keep editing, the
// reveal's score table, Ready and Next, and the final standings, awards and
// rounds. Saves screenshots.
import { test } from "@playwright/test"
import { VrViewType } from "../../../src/vr/view/view.ts"
import { until } from "../../pages/support.ts"
import { check, shot } from "../support.ts"
import { vrHostGuessing, vrHostInLobby, vrHostReveal } from "./vr-game-states.ts"
import { closeAllTabs, pressMenu, spray } from "./vr-support.ts"

test.afterEach(async ({ browser }) => closeAllTabs(browser))

test("the host starts the game from VR in the lobby, and round 1's menu shows the clock, the round, the players and the host's controls", async ({
  browser
}) => {
  const { headset, aliceLobby, bobLobby, can } = await vrHostInLobby(browser)

  // The host goes into VR in the lobby, and starts the game from there.
  const lobby = await until(
    "the lobby in VR",
    () => headset.panels.view(),
    (viewType) => viewType === VrViewType.LOBBY
  )
  const lobbyTable = await until(
    "the players in VR",
    () => headset.panels.scoreTable(),
    (table) => table?.rows.length === 2
  )
  check(
    lobby === VrViewType.LOBBY && lobbyTable?.rows.length === 2,
    `the lobby opens VR, listing the players (${JSON.stringify(lobbyTable?.rows.map((row) => row.name))})`
  )
  await headset.settle()
  await aliceLobby.screenshot(shot(`vrmp-0-lobby.png`))
  await pressMenu(headset, can, "act0")
  await aliceLobby.waitForGameToStart()
  await bobLobby.waitForGameToStart()
  check(
    (await until(
      "round 1 in VR",
      () => headset.panels.view(),
      (viewType) => viewType === VrViewType.PAINT,
      30_000
    )) === VrViewType.PAINT && (await headset.inSession()),
    "Start game in VR starts it, the headset still on"
  )
  const clock = await until(
    "the clock in VR",
    async () => (await headset.panels.menu()).clock,
    (clock) => /^\d:\d\d left$/.test(clock)
  )
  check(/^\d:\d\d left$/.test(clock), `the menu counts down the round (${clock})`)
  check((await headset.panels.doneLabel()) === "Pass", "with nothing painted, Done says Pass")

  // While guessing: which round, the players beside the globe, and the host's buttons.
  const guessing = await headset.panels.menu()
  const players = await until(
    "the players beside the globe",
    () => headset.panels.scoreTable(),
    (table) => table?.title === "Players"
  )
  check(
    guessing.heading === "ROUND 1 OF 2" && players?.rows.map((row) => row.detail).join() === "guessing,guessing",
    `the menu says which round, and the table who is still guessing (${guessing.heading}; ${JSON.stringify(players?.rows)})`
  )
  const moreLabels = () => headset.panels.menu().then((menu) => menu.more.map((action) => action.label))
  check(
    (await moreLabels()).join() === "End game,Leave game",
    `the host can end the game or leave it (${(await moreLabels()).join(", ")})`
  )
  await pressMenu(headset, can, "more0")
  check((await moreLabels())[0] === "Press again to end the game", "End game asks for a second press")
  check(
    (await until("End game to settle back", moreLabels, (labels) => labels[0] === "End game")).length > 0,
    "and without one it lets the game go on"
  )
  const bobRow = async () => {
    const i = (await headset.panels.scoreTable())!.rows.findIndex((row) => row.name === "Bob")
    await headset.controllers.press(can, await headset.panels.scoreRow(i))
  }
  await bobRow()
  const picked = await until("Bob picked", moreLabels, (labels) => labels.includes("Remove Bob"))
  check(
    picked.join() === "Remove Bob,Make Bob host,End game,Leave game",
    `pointing at Bob's row offers to remove him or make him host (${picked.join(", ")})`
  )
  await bobRow()
  await until("Bob let go", moreLabels, (labels) => !labels.includes("Remove Bob"))
})

test("painting in VR turns Pass into Done, which locks the guess in until Keep editing, and on the reveal the score rows pick whose paint the globe shows", async ({
  browser
}) => {
  const { headset, centre, can, aliceRound, bobRound } = await vrHostGuessing(browser)

  await spray(headset, aliceRound, { centre, can })
  const done = await until(
    "Done on the menu",
    () => headset.panels.doneLabel(),
    (label) => label === "Done"
  )
  check(done === "Done", "with paint down, it says Done")
  await aliceRound.screenshot(shot(`vrmp-1-painted.png`))

  await pressMenu(headset, can, "done")
  check(
    await until(
      "Keep editing",
      async () => (await headset.panels.menu()).unlock,
      (on) => on
    ),
    "Done in VR locks the guess in, and offers Keep editing"
  )
  await pressMenu(headset, can, "unlock")
  check(
    !(await until(
      "painting again",
      async () => (await headset.panels.menu()).unlock,
      (on) => !on
    )),
    "Keep editing unlocks it"
  )
  await pressMenu(headset, can, "done")
  await until(
    "locked again",
    async () => (await headset.panels.menu()).unlock,
    (on) => on
  )
  await bobRound.map.drag({ across: 0.3, down: 0.55 })
  await bobRound.finishLast()

  const reveal = await until(
    "the answer in VR",
    () => headset.panels.view(),
    (viewType) => viewType === VrViewType.REVEAL
  )
  check(reveal === VrViewType.REVEAL, "the reveal comes to the headset")
  const table = await until(
    "the round's scores",
    () => headset.panels.scoreTable(),
    (table) => table?.rows.length === 4
  )
  check(
    table?.title === "Round 1 of 2" && table.rows.some((row) => row.name === "Alice (you)"),
    `the score table lists both players (${JSON.stringify(table?.rows.map((row) => row.name))})`
  )

  // The table's rows pick whose paint the globe shows, as the page's do.
  const everyone = await until(
    "everyone's paint",
    () => headset.scene.globePaintCells(),
    (count) => count > 0
  )
  const pick = async (name: string, ok: (cells: number) => boolean) => {
    const i = (await headset.panels.scoreTable())!.rows.findIndex((row) => row.name === name)
    await headset.controllers.press(can, await headset.panels.scoreRow(i))
    const cells = await until(`${name}'s paint`, () => headset.scene.globePaintCells(), ok)
    const row = (await headset.panels.scoreTable())!.rows[i]!
    return { cells, selected: row.selected === true }
  }
  const alone = await pick("Alice (you)", (count) => count > 0 && count < everyone)
  await headset.settle()
  await aliceRound.screenshot(shot(`vrmp-2a-alone.png`))
  check(alone.selected, `pointing at Alice's row shows her paint alone (${alone.cells} of ${everyone} cells)`)
  const hidden = await pick("Hide paint", (count) => count === 0)
  check(hidden.selected, "Hide paint hides all paint")
  const back = await pick("Everyone", (count) => count === everyone)
  check(back.selected, "Everyone brings it all back")
  await headset.settle()
  await aliceRound.screenshot(shot(`vrmp-2-reveal.png`))
})

test("from the reveal, the host readies and brings round 2 with Next round, then the final standings and the awards board show in the headset", async ({
  browser
}) => {
  const { headset, can, aliceRound, bobReveal } = await vrHostReveal(browser)

  const actions = (await headset.panels.menu()).actions.map((action) => action.label)
  check(actions.join() === "Ready,Next round", `the host is offered Ready and Next round (${actions.join(", ")})`)
  await pressMenu(headset, can, "act0")
  const ready = await until(
    "ready",
    async () => (await headset.panels.menu()).actions[0],
    (action) => action?.enabled === false
  )
  check(ready?.label === "Waiting for the others…", "Ready in VR readies the host")

  await pressMenu(headset, can, "act1")
  check(
    (await until(
      "round 2 in VR",
      () => headset.panels.view(),
      (viewType) => viewType === VrViewType.PAINT
    )) === VrViewType.PAINT,
    "the host's Next round brings round 2 to the headset"
  )
  await until(
    "Pass on the menu",
    () => headset.panels.doneLabel(),
    (label) => label === "Pass"
  )
  await pressMenu(headset, can, "done")
  const bobRound2 = await bobReveal.waitForNextRound()
  await bobRound2.finishLast()
  await until(
    "round 2's answer in VR",
    () => headset.panels.view(),
    (viewType) => viewType === VrViewType.REVEAL
  )
  const last = (await headset.panels.menu()).actions.map((action) => action.label)
  check(last.includes("Show final results"), `the last round offers the final results (${last.join(", ")})`)
  await pressMenu(headset, can, "act1")
  const final = await until(
    "the final standings in VR",
    () => headset.panels.view(),
    (viewType) => viewType === VrViewType.DONE
  )
  const standings = await headset.panels.scoreTable()
  check(
    final === VrViewType.DONE && standings?.title === "Standings" && standings.rows.length === 2,
    `the final standings show in the headset (${JSON.stringify(standings?.rows.map((row) => row.name))})`
  )
  check(
    (await headset.panels.menu()).actions.map((action) => action.label).join() === "Play again",
    "and the host can play again from there"
  )
  const board = await until(
    "the results board",
    () => headset.panels.board(),
    (board) => board !== undefined
  )
  check(
    board?.rounds.length === 2,
    `a board shows the awards and every round (${board?.awards.map((award) => award.title).join(", ")}; ${board?.rounds.length} rounds)`
  )
  const zoomedOut = await until(
    "the globe back to its starting size",
    () => headset.scene.globeScale(),
    (scale) => scale < 1.01
  )
  check(zoomedOut < 1.01, `leaving the answer zooms the globe back out (${zoomedOut.toFixed(2)})`)
  await headset.settle()
  await aliceRound.screenshot(shot(`vrmp-3-standings.png`))
})
