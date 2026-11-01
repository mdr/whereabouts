import { useEffect } from "preact/hooks"
import type { RoomCode } from "@whereabouts/shared/ids"
import { Phase, type GameView } from "@whereabouts/shared/protocol"
import { ConnectionStatus, RejectionAction, type Connection } from "../../../net/net"
import { joinedCode, resetPlayerToken } from "../../../settings/settings"
import { preloadPictures } from "../../../data/preload"
import { navigate } from "../../../router"
import { MapView } from "../../../ui/map/MapView/MapView"
import { Lobby } from "../../lobby/Lobby/Lobby"
import { InGame } from "../../InGame/InGame"
import { Results } from "../../results/Results/Results"
import { Banner } from "../../../ui/Banner/Banner"
import { useGameSounds } from "../../../sound/useGameSounds"
import { useSavedSetup } from "../../../settings/host-setup"
import { useVrHold, useVrView } from "../../../ui/VrButton/VrButton"
import { VrViewType, type VrAction } from "../../../vr/view/view"
import { joinedTestIds } from "./JoinedTestIds"
import kit from "../../../ui/kit.module.css"
import s from "./Joined.module.css"

const upcomingOf = (view: GameView | undefined) => (view && view.phase !== Phase.RESULTS ? view.upcoming : undefined)

/** The game once a name is settled: its own component so its hooks always run. */
export function Joined({ conn, code, create }: { conn: Connection; code: RoomCode | undefined; create: boolean }) {
  // Once the server assigns a code to a new game, put it in the URL for sharing.
  const assigned = conn.code.value
  useEffect(() => {
    if (!assigned) return
    joinedCode.value = assigned
    if (create) history.replaceState(undefined, "", `#/game/${assigned}`)
  }, [assigned])

  // Removed by the host: this tab's token is banned from that game, so drop
  // it (and the remembered code) and rejoin, if at all, as a new player.
  const state = conn.status.value
  const removed = state.type === ConnectionStatus.REJECTED && state.rejection.action === RejectionAction.FORGET_SEAT
  useEffect(() => {
    if (!removed) return
    resetPlayerToken()
    joinedCode.value = ""
  }, [removed])

  const view = conn.view.value
  useGameSounds(conn, view)
  useSavedSetup(conn, view, create)
  useVrHold()
  const upcoming = upcomingOf(view)
  useEffect(() => {
    if (upcoming) preloadPictures(upcoming)
  }, [upcoming?.image, upcoming?.flag, upcoming?.revealPhoto])

  if (state.type === ConnectionStatus.REJECTED) {
    const why = state.rejection
    const primary =
      why.action === RejectionAction.RETRY
        ? { label: "Try again", press: () => conn.rejoin(), testId: joinedTestIds.tryAgainButton }
        : why.action === RejectionAction.HOST_UNDER_CODE && code
          ? {
              label: `Host game ${code}`,
              press: () => navigate(`/game/new/${code}`),
              testId: joinedTestIds.hostUnderCodeButton
            }
          : { label: "Host a new game", press: () => navigate("/game/new"), testId: joinedTestIds.hostNewButton }
    return (
      <div class={kit.page} data-testid={joinedTestIds.problem}>
        <VrNotice
          title={why.title}
          line={why.detail}
          actions={[primary, { label: "Back to start", press: () => navigate("/") }]}
        />
        <div class={kit.pageCard}>
          <Banner />
          <h2 data-testid={joinedTestIds.problemTitle}>{why.title}</h2>
          <p class={kit.tagline}>{why.detail}</p>
          <div class={s.actions}>
            <button class="primary big" onClick={primary.press} data-testid={primary.testId}>
              {primary.label}
            </button>
            <button onClick={() => navigate("/")} data-testid={joinedTestIds.backToStartButton}>
              Back to start
            </button>
          </div>
        </div>
      </div>
    )
  }
  if (!view) {
    return (
      <div class={kit.page}>
        <VrNotice title={create ? "Creating your game…" : `Joining ${code}…`} line="" actions={[]} />
        <div class={kit.pageCard}>
          <Banner />
          <p class={kit.hint}>{create ? "Creating your game…" : `Joining ${code}…`}</p>
        </div>
      </div>
    )
  }
  if (view.phase === Phase.LOBBY) return <Lobby conn={conn} view={view} />
  if (view.phase === Phase.RESULTS) return <Results conn={conn} view={view} />
  return (
    <MapView>
      <InGame conn={conn} view={view} />
    </MapView>
  )
}

/** The headset's view while there is no game to show: joining it, or why not. */
function VrNotice({ title, line, actions }: { title: string; line: string; actions: VrAction[] }) {
  useVrView({ type: VrViewType.LOBBY, summary: { title, scoreLine: line, actions } })
  return undefined
}
