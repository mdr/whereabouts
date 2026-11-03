// An online game on the in-process server with the host in VR, on an emulated
// Quest 3 (see pages/headset/Headset.ts), and a second player seated by the server: starting from the lobby
// in VR, the clock and the host's controls, Pass, Done and Keep editing, the
// reveal's score table, Ready and Next, and the final standings, awards and
// rounds. Saves screenshots.
import { test } from "../../game-server/game-server.ts"
import { mixOf } from "@whereabouts/shared/protocol/config"
import { QuestionType } from "@whereabouts/shared/questions"
import { VrViewType } from "../../../src/vr/view/view.ts"
import { shot } from "../support.ts"
import { vrHostGuessing, vrHostInLobby, vrHostReveal } from "./vr-game-states.ts"
import { closeAllTabs, pressMenu, pressScoreRow, spray } from "./vr-support.ts"

test.use({ serverOptions: { config: { mix: mixOf({ [QuestionType.PLACE]: 2 }), roundLength: 60_000 } } })

test.afterEach(async ({ browser }) => closeAllTabs(browser))

test("the host starts the game from VR in the lobby, and round 1's menu shows the clock, the round, the players and the host's controls", async ({
  browser,
  game
}) => {
  const { headset, aliceLobby, can } = await vrHostInLobby(browser, game)

  // The host goes into VR in the lobby, and starts the game from there.
  await headset.panels.expectView(VrViewType.LOBBY)
  await headset.panels.expectScoreTable({ rowCount: 2 })
  await headset.settle()
  await aliceLobby.screenshot(shot(`vrmp-0-lobby.png`))
  await pressMenu(headset, can, "act0")
  await aliceLobby.waitForGameToStart()
  await headset.panels.expectView(VrViewType.PAINT, { timeout: 30_000 })
  await headset.expectInSession()
  await headset.panels.expectClock()
  await headset.panels.expectDoneLabel("Pass")

  // While guessing: which round, the players beside the globe, and the host's buttons.
  await headset.panels.expectHeading("ROUND 1 OF 2")
  await headset.panels.expectScoreTable({ title: "Players", details: ["guessing", "guessing"] })
  await headset.panels.expectMoreActions(["End game", "Leave game"])
  await pressMenu(headset, can, "more0")
  await headset.panels.expectFirstMoreAction("Press again to end the game")
  await headset.panels.expectFirstMoreAction("End game")
  await pressScoreRow(headset, can, "Bob")
  await headset.panels.expectMoreActions(["Remove Bob", "Make Bob host", "End game", "Leave game"])
  await pressScoreRow(headset, can, "Bob")
  await headset.panels.expectMoreActions(["End game", "Leave game"])
})

test("painting in VR turns Pass into Done, which locks the guess in until Keep editing, and on the reveal the score rows pick whose paint the globe shows", async ({
  browser,
  game
}) => {
  const { headset, centre, can, aliceRound, bob } = await vrHostGuessing(browser, game)

  await spray(headset, aliceRound, { centre, can })
  await headset.panels.expectDoneLabel("Done")
  await aliceRound.screenshot(shot(`vrmp-1-painted.png`))

  await pressMenu(headset, can, "done")
  await headset.panels.expectKeepEditing(true)
  await pressMenu(headset, can, "unlock")
  await headset.panels.expectKeepEditing(false)
  await pressMenu(headset, can, "done")
  await headset.panels.expectKeepEditing(true)
  game.paint(bob, { lat: 30, lon: 50 }, 300)
  game.lock([bob])

  await headset.panels.expectView(VrViewType.REVEAL)
  await headset.panels.expectScoreTable({ title: "Round 1 of 2", rowCount: 4, namesInclude: ["Alice (you)"] })

  // The table's rows pick whose paint the globe shows, as the page's do.
  await headset.scene.expectGlobePaintCells({ atLeast: 1 })
  const everyone = await headset.scene.globePaintCells()
  await pressScoreRow(headset, can, "Alice (you)")
  await headset.scene.expectGlobePaintCells({ greaterThan: 0, lessThan: everyone })
  await headset.panels.expectRowSelected("Alice (you)")
  await headset.settle()
  await aliceRound.screenshot(shot(`vrmp-2a-alone.png`))
  await pressScoreRow(headset, can, "Hide paint")
  await headset.scene.expectGlobePaintCells({ exactly: 0 })
  await headset.panels.expectRowSelected("Hide paint")
  await pressScoreRow(headset, can, "Everyone")
  await headset.scene.expectGlobePaintCells({ exactly: everyone })
  await headset.panels.expectRowSelected("Everyone")
  await headset.settle()
  await aliceRound.screenshot(shot(`vrmp-2-reveal.png`))
})

test("from the reveal, the host readies and brings round 2 with Next round, then the final standings and the awards board show in the headset", async ({
  browser,
  game
}) => {
  const { headset, can, aliceRound, bob } = await vrHostReveal(browser, game)

  await headset.panels.expectActions(["Ready", "Next round"])
  await pressMenu(headset, can, "act0")
  await headset.panels.expectFirstAction("Waiting for the others…", false)

  await pressMenu(headset, can, "act1")
  await headset.panels.expectView(VrViewType.PAINT)
  await headset.panels.expectDoneLabel("Pass")
  await pressMenu(headset, can, "done")
  game.lock([bob])
  await headset.panels.expectView(VrViewType.REVEAL)
  await headset.panels.expectActionOffered("Show final results")
  await pressMenu(headset, can, "act1")
  await headset.panels.expectView(VrViewType.DONE)
  await headset.panels.expectScoreTable({ title: "Standings", rowCount: 2 })
  await headset.panels.expectActions(["Play again"])
  await headset.panels.expectBoardRounds(2)
  await headset.scene.expectGlobeScale({ lessThan: 1.01 })
  await headset.settle()
  await aliceRound.screenshot(shot(`vrmp-3-standings.png`))
})
