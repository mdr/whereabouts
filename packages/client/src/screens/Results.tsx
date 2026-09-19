import { playerColour, type GameView } from "@whereabouts/shared";
import type { Connection } from "../net";

export function Results({ conn, view }: { conn: Connection; view: GameView }) {
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const standings = view.results ?? [];
  const winner = standings[0] ? byId.get(standings[0].playerId) : undefined;
  return (
    <div class="home">
      <div class="home-card results-card">
        <h1>Whereabouts</h1>
        {winner && (
          <p class="tagline">
            <span class="swatch" style={{ background: playerColour(winner.colour) }} /> <b>{winner.name}</b> wins
          </p>
        )}
        <ol class="final">
          {standings.map((s, i) => {
            const p = byId.get(s.playerId);
            return (
              <li key={s.playerId} class={s.playerId === view.you.id ? "you" : ""}>
                <span class="place">{i + 1}</span>
                <span class="swatch" style={{ background: p ? playerColour(p.colour) : "#888" }} />
                <span class="name">{p?.name ?? "?"}</span>
                <span class="rounds">{s.rounds.map((r) => Math.round(r)).join(" · ")}</span>
                <span class="score-num">{Math.round(s.total).toLocaleString()}</span>
              </li>
            );
          })}
        </ol>
        {view.you.isHost ? (
          <button class="primary big" onClick={() => conn.again()}>
            Play again
          </button>
        ) : (
          <p class="hint">The host can start another game with the same group.</p>
        )}
        <p class="hint">
          <a href="#/">Leave</a>
        </p>
      </div>
    </div>
  );
}
