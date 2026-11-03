import type { GameView } from "@whereabouts/shared/protocol/views"
import { everyone } from "@whereabouts/shared/roles"
import { useGameService } from "../../game-service/use-game-service"
import { Card } from "../Card/Card"
import { DevFacts } from "../dev/DevFacts"
import { cx } from "../cx"
import kit from "../kit.module.css"

/** Connection and game-state diagnostics for the dev drawer. */
export const ConnectionDev = ({ view }: { view: GameView }) => {
  const game = useGameService()
  return (
    <Card title="Connection">
      <DevFacts
        facts={[
          ["Status", game.status.value.type],
          ["Code", view.code],
          ["Phase", view.phase],
          ["Clock offset", `${Math.round(game.clockOffset.value)} ms`],
          ["Server time", new Date(view.serverTime).toISOString().slice(11, 23)],
          ["Kernel", view.config.kernelId],
          ["Host", view.you.isHost ? "you" : (everyone(view).find((player) => player.isHost)?.name ?? "?")],
          ["You", `${view.you.name} (${view.you.id})`]
        ]}
      />
      {game.lastError.value && <p class={cx(kit.hint, kit.warn)}>{game.lastError.value}</p>}
    </Card>
  )
}
