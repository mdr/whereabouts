import type { GameView } from "@whereabouts/shared/protocol/views"
import type { Connection } from "../../../../net/net"
import { HostWord } from "../../../../ui/players/HostWord"
import { Icon } from "../../../../ui/icons"
import { VrButton } from "../../../../ui/VrButton/VrButton"
import type { VrView } from "../../../../vr/view/view"
import kit from "../../../../ui/kit.module.css"
import { LobbyPanel } from "../../LobbyPanel/LobbyPanel"
import { DeviceSwitches } from "../DeviceSwitches/DeviceSwitches"
import { HostSettings } from "../HostSettings/HostSettings"
import { SetupSummary } from "../SetupSummary/SetupSummary"
import { setupPanelTestIds } from "./SetupPanelTestIds"
import styles from "./SetupPanel.module.css"

/** The right panel: the game's setup, this device's switches, and the way to start. */
export function SetupPanel({
  conn,
  view,
  online,
  vrView,
  playerCount
}: {
  conn: Connection
  view: GameView
  online: boolean
  vrView: VrView
  playerCount: number
}) {
  const host = view.you.isHost
  return (
    <LobbyPanel>
      <h2>Game setup</h2>
      {host ? (
        <HostSettings conn={conn} view={view} online={online} />
      ) : (
        <>
          <SetupSummary view={view} />
          <p class={kit.hint}>
            <HostWord capital /> picks these.
          </p>
        </>
      )}
      <h2>This device</h2>
      <DeviceSwitches />
      <div class={styles.start}>
        <VrButton view={vrView} />
        {host ? (
          <button
            class="primary big"
            data-testid={setupPanelTestIds.startButton}
            onClick={() => conn.start()}
            disabled={playerCount < 1 || !online}
            title={playerCount < 1 ? "Someone needs to play: take a seat, or wait for a player" : undefined}
          >
            <Icon name="play" /> Start game
          </button>
        ) : (
          <p class={kit.hint}>
            Waiting for <HostWord /> to start…
          </p>
        )}
      </div>
    </LobbyPanel>
  )
}
