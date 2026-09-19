import { playerColour, type GameView } from "@whereabouts/shared";
import type { Connection } from "../net";
import { Icon } from "../ui/icons";
import { HostTag, HostWord } from "../ui/PlayerList";

const MEDALS = ["🥇", "🥈", "🥉"];

export function Results({ conn, view }: { conn: Connection; view: GameView }) {
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const standings = view.results ?? [];
  const winner = standings[0] ? byId.get(standings[0].playerId) : undefined;
  const rounds = Math.max(0, ...standings.map((s) => s.rounds.length));
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
        {/* One grid: place, colour, name, a column per round, total. */}
        <div class="standings" style={{ "--rounds": rounds }} role="table" aria-label="Final standings">
          <div class="standings-head" role="row">
            <span />
            <span />
            <span />
            {Array.from({ length: rounds }, (_, i) => (
              <span key={i} class="num" title={`Round ${i + 1}`}>
                R{i + 1}
              </span>
            ))}
            <span class="num">Total</span>
          </div>
          {standings.map((s, i) => {
            const p = byId.get(s.playerId);
            return (
              <div key={s.playerId} class={`standings-row ${s.playerId === view.you.id ? "you" : ""}`} role="row">
                <span class="place">{MEDALS[i] ?? i + 1}</span>
                <span class="dot">
                  <i class="swatch" style={{ background: p ? playerColour(p.colour) : "#888" }} />
                </span>
                <span class="name">
                  {p?.name ?? "?"}
                  {p?.isHost && <HostTag />}
                </span>
                {Array.from({ length: rounds }, (_, r) => {
                  const score = s.rounds[r];
                  return (
                    <span key={r} class="num round">
                      {score === undefined ? "–" : Math.round(score)}
                    </span>
                  );
                })}
                <span class="num total">{Math.round(s.total).toLocaleString()}</span>
              </div>
            );
          })}
        </div>
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
