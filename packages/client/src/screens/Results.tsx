import { playerColour, type GameView } from "@whereabouts/shared";
import type { Connection } from "../net";
import { Icon } from "../ui/icons";
import { HostTag, HostWord } from "../ui/PlayerList";

const MEDALS = ["🥇", "🥈", "🥉"];

export function Results({ conn, view }: { conn: Connection; view: GameView }) {
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const standings = view.results ?? [];
  const winner = standings[0] ? byId.get(standings[0].playerId) : undefined;
  // The top score in each round, so each round's winner is picked out.
  const roundCount = Math.max(0, ...standings.map((s) => s.rounds.length));
  const roundBest = Array.from({ length: roundCount }, (_, r) =>
    Math.max(-1, ...standings.map((s) => s.rounds[r] ?? -1)),
  );
  return (
    <div class="home">
      <div class="home-card results-card">
        <h1>Whereabouts</h1>
        {winner && (
          <p class="tagline">
            <span class="swatch" style={{ background: playerColour(winner.colour) }} /> <b>{winner.name}</b>
            {winner.isHost && <HostTag />} wins
          </p>
        )}
        {/* Total first and largest; the round scores sit underneath as a small strip, each round's winner in bold. */}
        <ol class="standings" aria-label="Final standings">
          {standings.map((s, i) => {
            const p = byId.get(s.playerId);
            return (
              <li key={s.playerId} class={`standings-row ${s.playerId === view.you.id ? "you" : ""}`}>
                <span class="place">{MEDALS[i] ?? i + 1}</span>
                <span class="dot">
                  <i class="swatch" style={{ background: p ? playerColour(p.colour) : "#888" }} />
                </span>
                <span class="standing-body">
                  <span class="standing-main">
                    <span class="name">
                      <span class="name-text">{p?.name ?? "?"}</span>
                      {p?.isHost && <HostTag />}
                    </span>
                    <span class="total" title="Total">
                      {Math.round(s.total).toLocaleString()}
                    </span>
                  </span>
                  <span class="rounds" aria-label="Score by round">
                    {s.rounds.map((score, r) => (
                      <span
                        key={r}
                        class={`round ${score !== null && score === roundBest[r] ? "best" : ""}`}
                        title={`Round ${r + 1}${score == null ? ": sat out" : score === roundBest[r] ? ": won the round" : ""}`}
                      >
                        {score == null ? "–" : Math.round(score)}
                      </span>
                    ))}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        {view.you.isHost ? (
          <button class="primary big" onClick={() => conn.again()}>
            <Icon name="refresh" /> Play again
          </button>
        ) : (
          <p class="hint">
            <HostWord capital /> can start another game with the same group.
          </p>
        )}
        <p class="hint">
          <a href="#/">Leave</a>
        </p>
      </div>
    </div>
  );
}
