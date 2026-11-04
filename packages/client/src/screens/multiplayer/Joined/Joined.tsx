import { useEffect } from "preact/hooks"
import { GameEntryType, type GameEntry } from "@whereabouts/shared/protocol/ticket"
import { ConnectionStatus } from "../../../game-service/connection-state"
import { useGameService } from "../../../game-service/use-game-service"
import { RejectionAction } from "../../../net/rejection"
import { joinedCode, resetPlayerToken } from "../../../settings/settings"
import { navigate } from "../../../router"
import { Banner } from "../../../ui/Banner/Banner"
import { useSavedSetup } from "../../../settings/host-setup"
import { GameScreen } from "../../GameScreen/GameScreen"
import { useVrHold, useVrView } from "../../../ui/VrButton/VrButton"
import { VrViewType, type VrAction } from "../../../vr/view/view"
import { joinedTestIds } from "./JoinedTestIds"
import kit from "../../../ui/kit.module.css"
import styles from "./Joined.module.css"

/** The game once a name is settled: its own component so its hooks always run. */
export const Joined = ({ entry }: { entry: GameEntry }) => {
  const game = useGameService()
  const create = entry.type === GameEntryType.HOST
  const code = entry.code
  // Once the server assigns a code to a new game, put it in the URL for sharing.
  const assigned = game.code.value
  useEffect(() => {
    if (!assigned) return
    joinedCode.value = assigned
    if (create) history.replaceState(undefined, "", `#/game/${assigned}`)
  }, [assigned, create])

  // Removed by the host: this tab's token is banned from that game, so drop
  // it (and the remembered code) and rejoin, if at all, as a new player.
  const state = game.status.value
  const removed = state.type === ConnectionStatus.REJECTED && state.rejection.action === RejectionAction.FORGET_SEAT
  useEffect(() => {
    if (!removed) return
    resetPlayerToken()
    joinedCode.value = ""
  }, [removed])

  const view = game.view.value
  useSavedSetup(game, view, create)
  useVrHold()

  if (state.type === ConnectionStatus.REJECTED) {
    const why = state.rejection
    const primary =
      why.action === RejectionAction.RETRY
        ? { label: "Try again", press: () => game.rejoin(), testId: joinedTestIds.tryAgainButton }
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
          <div class={styles.actions}>
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
  return <GameScreen view={view} />
}

/** The headset's view while there is no game to show: joining it, or why not. */
const VrNotice = ({ title, line, actions }: { title: string; line: string; actions: VrAction[] }) => {
  useVrView({ type: VrViewType.LOBBY, summary: { title, scoreLine: line, actions } })
  return undefined
}
