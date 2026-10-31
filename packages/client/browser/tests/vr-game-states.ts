// Starting states for an online game whose host, Alice, plays in an emulated headset and Bob on a page.
import type { Browser } from "@playwright/test"
import { QuestionType } from "@whereabouts/shared/questions"
import { VrViewType } from "../../src/vr/view.ts"
import type { Headset } from "../pages/Headset.ts"
import type { LobbyPage } from "../pages/LobbyPage.ts"
import type { RevealPage } from "../pages/RevealPage.ts"
import type { RoundPage } from "../pages/RoundPage.ts"
import { until } from "../pages/support.ts"
import { newTab } from "./support.ts"
import { enterVr, newHeadsetTab, poses, pressMenu } from "./vr-support.ts"

type Vec = [number, number, number]

interface VrLobby {
  headset: Headset
  aliceLobby: LobbyPage
  bobLobby: LobbyPage
  centre: Vec
  can: Vec
}

interface VrGuessing {
  headset: Headset
  centre: Vec
  can: Vec
  aliceRound: RoundPage
  bobRound: RoundPage
}

/** Alice hosting in VR, still in the lobby; Bob has joined, and two 60 s place rounds are set. */
export async function vrHostInLobby(browser: Browser): Promise<VrLobby> {
  const { tab: aliceTab, headset } = await newHeadsetTab(browser, "Alice")
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
  await enterVr(aliceTab, headset)
  return { headset, aliceLobby, bobLobby, ...(await poses(headset)) }
}

/** That game started from the headset: round 1, nothing painted yet. */
export async function vrHostGuessing(browser: Browser): Promise<VrGuessing> {
  const { headset, aliceLobby, bobLobby, centre, can } = await vrHostInLobby(browser)
  await until(
    "the lobby in VR",
    () => headset.view(),
    (v) => v === VrViewType.LOBBY
  )
  await until(
    "the players in VR",
    () => headset.scoreTable(),
    (t) => t?.rows.length === 2
  )
  await pressMenu(headset, can, "act0")
  const aliceRound = await aliceLobby.waitForGameToStart()
  const bobRound = await bobLobby.waitForGameToStart()
  await until(
    "round 1 in VR",
    () => headset.view(),
    (v) => v === VrViewType.PAINT,
    30_000
  )
  return { headset, centre, can, aliceRound, bobRound }
}

/** Round 1's answer in VR, both players having passed. */
export async function vrHostReveal(browser: Browser): Promise<VrGuessing & { bobReveal: RevealPage }> {
  const guessing = await vrHostGuessing(browser)
  const { headset, can, bobRound } = guessing
  await until(
    "Pass on the menu",
    () => headset.doneLabel(),
    (l) => l === "Pass"
  )
  await pressMenu(headset, can, "done")
  // Bob must finish last, so the reveal follows his Done.
  await until(
    "Alice's pass locked in",
    async () => (await headset.menu()).unlock,
    (on) => on
  )
  const bobReveal = await bobRound.finishLast()
  await until(
    "the answer in VR",
    () => headset.view(),
    (v) => v === VrViewType.REVEAL
  )
  return { ...guessing, bobReveal }
}
