import { playerColour, type PlayerView } from "@whereabouts/shared";

export function PlayerList({
  players,
  you,
  showScores,
  arrows,
}: {
  players: PlayerView[];
  you: string;
  showScores: boolean;
  arrows?: boolean;
}) {
  return (
    <ul class="players">
      {players.map((p) => {
        const delta = arrows && p.previousRank !== null ? p.previousRank - p.rank : 0;
        return (
          <li key={p.id} class={`${p.id === you ? "you" : ""} ${p.connected ? "" : "offline"}`}>
            <span class="swatch" style={{ background: playerColour(p.colour) }} />
            <span class="name">
              {p.name}
              {p.isHost ? <span class="tag">host</span> : null}
              {p.id === you ? <span class="tag">you</span> : null}
              {!p.connected ? <span class="tag">offline</span> : null}
            </span>
            {showScores && (
              <>
                {arrows && (
                  <span class={`arrow ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
                    {delta > 0 ? "▲" : delta < 0 ? "▼" : ""}
                  </span>
                )}
                <span class="score-num">{Math.round(p.score).toLocaleString()}</span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
