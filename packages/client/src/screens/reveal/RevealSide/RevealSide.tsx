import type { PaintedCountry } from "@whereabouts/shared/borders"
import type { PlayerId } from "@whereabouts/shared/ids"
import type { GameView } from "@whereabouts/shared/protocol/views"
import { useGameService } from "../../../game-service/use-game-service"
import type { RevealShown } from "../../../round/reveal"
import { canEndGame, type RevealModel } from "../../../round/round-model"
import { useConfirm } from "../../../ui/ConfirmDialog/ConfirmDialog"
import { kickRequest } from "../../../ui/ConfirmDialog/confirm-requests"
import { HudRight } from "../../../ui/map/Hud/Hud"
import { EndGameButton } from "../../../ui/players/HostControls/HostControls"
import { RevealScores } from "../RevealScores/RevealScores"

/** Everyone's scores down the right, and the host's End game. */
export const RevealSide = ({
  view,
  model,
  where,
  answerFlag,
  onSelect,
  onHover
}: {
  view: GameView
  model: RevealModel
  where: ReadonlyMap<PlayerId, PaintedCountry | undefined>
  answerFlag: string | undefined
  onSelect: (pick: RevealShown) => void
  onHover: (playerId: PlayerId | undefined) => void
}) => {
  const game = useGameService()
  const { dialog, ask } = useConfirm()
  return (
    <>
      {dialog}
      <HudRight>
        <RevealScores
          model={model}
          where={where}
          answerFlag={answerFlag}
          onSelect={onSelect}
          onHover={onHover}
          onKick={view.you.isHost ? (player) => ask(kickRequest(player.name, () => game.kick(player.id))) : undefined}
        />
        {/* Where it is while guessing too, and away from Next round below. */}
        {canEndGame(view) && <EndGameButton onEnd={() => game.end()} />}
      </HudRight>
    </>
  )
}
