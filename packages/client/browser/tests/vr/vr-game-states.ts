// Starting states for an online game whose host, Alice, plays in an emulated headset and Bob on a page.
import type { Browser } from "@playwright/test"
import type { PlayerToken } from "@whereabouts/shared/ids"
import { VrViewType } from "../../../src/vr/view/view.ts"
import type { Headset } from "../../pages/headset/Headset.ts"
import type { TestGame } from "../../game-server/game-server.ts"
import type { LobbyPage } from "../../pages/LobbyPage.ts"
import type { RoundPage } from "../../pages/RoundPage.ts"
import { enterVr, newHeadsetTab, poses, pressMenu } from "./vr-support.ts"
import type { Vec3 } from "../../../src/vr/probe.ts"

interface VrLobby {
  headset: Headset
  aliceLobby: LobbyPage
  bob: PlayerToken
  centre: Vec3
  can: Vec3
}

interface VrGuessing {
  headset: Headset
  centre: Vec3
  can: Vec3
  aliceRound: RoundPage
  bob: PlayerToken
}

/** Alice hosting in VR, still in the lobby; Bob is seated. */
export const vrHostInLobby = async (browser: Browser, game: TestGame): Promise<VrLobby> => {
  const { tab: aliceTab, headset } = await newHeadsetTab(browser, "Alice", undefined, game)
  const aliceHome = await aliceTab.openHome()
  await aliceHome.enterName("Alice")
  const aliceLobby = await aliceHome.hostGame()
  const [bob] = game.seat(["Bob"])
  await aliceLobby.players.waitForPlayer("Bob", 5_000)
  await enterVr(headset)
  return { headset, aliceLobby, bob: bob!, ...(await poses(headset)) }
}

/** That game started from the headset: round 1, nothing painted yet. */
export const vrHostGuessing = async (browser: Browser, game: TestGame): Promise<VrGuessing> => {
  const { headset, aliceLobby, bob, centre, can } = await vrHostInLobby(browser, game)
  await headset.panels.expectView(VrViewType.LOBBY)
  await headset.panels.expectScoreTable({ rowCount: 2 })
  await pressMenu(headset, can, "act0")
  // The page draws the round while the headset session draws its frames, both in software.
  const aliceRound = await aliceLobby.waitForGameToStart(60_000)
  await headset.panels.expectView(VrViewType.PAINT, { timeout: 30_000 })
  return { headset, centre, can, aliceRound, bob }
}

/** Round 1's answer in VR, both players having passed. */
export const vrHostReveal = async (browser: Browser, game: TestGame): Promise<VrGuessing> => {
  const guessing = await vrHostGuessing(browser, game)
  const { headset, can, bob } = guessing
  await headset.panels.expectDoneLabel("Pass")
  await pressMenu(headset, can, "done")
  // Bob finishes last, so the reveal follows his Done.
  await headset.panels.expectKeepEditing(true)
  game.lock([bob])
  await headset.panels.expectView(VrViewType.REVEAL)
  return guessing
}
