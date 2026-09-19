import { playerColour, type PlayerView } from "@whereabouts/shared";
import { Icon } from "./icons";

export function PlayerList({
  players,
  you,
  showScores,
  arrows,
  showLocked,
  onRename,
}: {
  players: PlayerView[];
  you: string;
  showScores: boolean;
  arrows?: boolean;
  /** Mark players who have locked in this round. */
  showLocked?: boolean;
  /** When given, your own row gets a pencil that calls this. */
  onRename?: () => void;
}) {
  return (
    <ul class="players">
      {players.map((p) => {
        const delta = arrows && p.previousRank !== null ? p.previousRank - p.rank : 0;
        const isYou = p.id === you;
        return (
          <li key={p.id} class={`${isYou ? "you" : ""} ${p.connected ? "" : "offline"}`}>
            <span class="swatch" style={{ background: playerColour(p.colour) }} />
            <span class="name">
              {p.name}
              {p.isHost ? (
                <span class="tag host" title="Host">
                  <Icon name="crown" size={12} />
                  <span class="sr-only">host</span>
                </span>
              ) : null}
              {isYou ? <span class="tag">you</span> : null}
              {!p.connected ? <span class="tag">offline</span> : null}
              {showLocked && p.locked ? (
                <span class="tag locked" title="Locked in">
                  <Icon name="lock" size={11} /> locked
                </span>
              ) : null}
            </span>
            {isYou && onRename && (
              <button class="icon" title="Change your name" aria-label="Change your name" onClick={onRename}>
                ✎
              </button>
            )}
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
