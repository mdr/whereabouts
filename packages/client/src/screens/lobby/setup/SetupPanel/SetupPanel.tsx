import type { GameView } from "@whereabouts/shared/protocol/views"
import { useGameService } from "../../../../game-service/use-game-service"
import { HostWord } from "../../../../ui/players/HostWord"
import { canStart } from "../../../../ui/players/seat-rules"
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
export const SetupPanel = ({ view, vrView }: { view: GameView; vrView: VrView }) => {
  const game = useGameService()
  const host = view.you.isHost
  return (
    <LobbyPanel>
      <h2>Game setup</h2>
      {host ? (
        <HostSettings view={view} />
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
            onClick={() => game.start()}
            disabled={!canStart(view, game.online.value)}
            title={!canStart(view, true) ? "Someone needs to play: take a seat, or wait for a player" : undefined}
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
