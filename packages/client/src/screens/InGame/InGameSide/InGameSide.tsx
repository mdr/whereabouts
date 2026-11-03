import type { InPlayGameView } from "@whereabouts/shared/protocol/views"
import { useGameService } from "../../../game-service/use-game-service"
import { canEndGame } from "../../../round/round-model"
import { useConfirm } from "../../../ui/ConfirmDialog/ConfirmDialog"
import { kickRequest, makeHostRequest } from "../../../ui/ConfirmDialog/confirm-requests"
import { HudRight } from "../../../ui/map/Hud/Hud"
import { EndGameButton } from "../../../ui/players/HostControls/HostControls"
import { PlayersPanel, playersPanelOpen } from "../../../ui/players/PlayersPanel/PlayersPanel"

/** The players panel and the host's End game, down the right of a round. */
export const InGameSide = ({ view }: { view: InPlayGameView }) => {
  const game = useGameService()
  const { dialog, ask } = useConfirm()
  const host = view.you.isHost
  return (
    <>
      {dialog}
      <HudRight roomy={playersPanelOpen.value}>
        <PlayersPanel
          view={view}
          onKick={host ? (player) => ask(kickRequest(player.name, () => game.kick(player.id))) : undefined}
          onMakeHost={host ? (player) => ask(makeHostRequest(player.name, () => game.makeHost(player.id))) : undefined}
        />
        {canEndGame(view) && (
          <EndGameButton
            onEnd={() => game.end()}
            title="Score this round as it stands and show the final standings"
            besidePlayers
          />
        )}
      </HudRight>
    </>
  )
}
