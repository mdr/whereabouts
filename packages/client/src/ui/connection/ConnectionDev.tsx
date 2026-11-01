import type { GameView } from "@whereabouts/shared/protocol/views"
import { everyone } from "@whereabouts/shared/roles"
import type { Connection } from "../../net/net"
import { Card } from "../Card/Card"
import { DevFacts } from "../dev/DevFacts"
import { cx } from "../cx"
import kit from "../kit.module.css"

/** Connection and game-state diagnostics for the dev drawer. */
export const ConnectionDev = ({ conn, view }: { conn: Connection; view: GameView }) => (
  <Card title="Connection">
    <DevFacts
      facts={[
        ["Status", conn.status.value.type],
        ["Code", view.code],
        ["Phase", view.phase],
        ["Clock offset", `${Math.round(conn.clockOffset.value)} ms`],
        ["Server time", new Date(view.serverTime).toISOString().slice(11, 23)],
        ["Kernel", view.config.kernelId],
        ["Host", view.you.isHost ? "you" : (everyone(view).find((player) => player.isHost)?.name ?? "?")],
        ["You", `${view.you.name} (${view.you.id})`]
      ]}
    />
    {conn.lastError.value && <p class={cx(kit.hint, kit.warn)}>{conn.lastError.value}</p>}
  </Card>
)
