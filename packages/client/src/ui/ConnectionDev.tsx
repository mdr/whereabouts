import type { GameView } from "@whereabouts/shared";
import type { Connection } from "../net";
import { Card } from "./bits";
import { DevFacts } from "./DevDrawer";

/** Connection and game-state diagnostics for the dev drawer. */
export function ConnectionDev({ conn, view }: { conn: Connection; view: GameView }) {
  const you = view.players.find((p) => p.id === view.you.id);
  return (
    <Card title="Connection">
      <DevFacts
        facts={[
          ["Status", conn.status.value],
          ["Code", view.code],
          ["Phase", view.phase],
          ["Clock offset", `${Math.round(conn.clockOffset.value)} ms`],
          ["Server time", new Date(view.serverTime).toISOString().slice(11, 23)],
          ["Kernel", view.config.kernelId],
          ["Host", view.you.isHost ? "you" : (view.players.find((p) => p.isHost)?.name ?? "?")],
          ["You", `${you?.name ?? "?"} (${view.you.id.slice(0, 8)})`],
        ]}
      />
      {conn.lastError.value && <p class="hint warn">{conn.lastError.value}</p>}
    </Card>
  );
}
