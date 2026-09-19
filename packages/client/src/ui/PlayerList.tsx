import { playerColour, type PlayerView } from "@whereabouts/shared";
import { Icon } from "./icons";

/** Crown tag marking the host in a player row; the word stays for screen readers. */
export function HostTag() {
  return (
    <span class="tag host" title="Host">
      <Icon name="crown" size={12} />
      <span class="sr-only">host</span>
    </span>
  );
}

/** "the host" in running text, with the crown. */
export function HostWord({ capital }: { capital?: boolean }) {
  return (
    <span class="host-word">
      <Icon name="crown" size={12} />
      {capital ? "The host" : "the host"}
    </span>
  );
}

export function PlayerList({
  players,
  you,
  showScores,
  arrows,
  showLocked,
  onRename,
  onKick,
}: {
  players: PlayerView[];
  you: string;
  showScores: boolean;
  arrows?: boolean;
  /** Mark players who have locked in this round. */
  showLocked?: boolean;
  /** When given, your own row gets a pencil that calls this. */
  onRename?: () => void;
  /** Host only: when given, every other row gets a remove button that calls this. */
  onKick?: (player: PlayerView) => void;
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
              <span class="name-text">{p.name}</span>
              {p.isHost ? <HostTag /> : null}
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
            {!isYou && onKick && (
              <button
                class="icon kick"
                title={`Remove ${p.name} from the game`}
                aria-label={`Remove ${p.name} from the game`}
                onClick={(e) => {
                  e.stopPropagation();
                  onKick(p);
                }}
              >
                <Icon name="kick" size={13} />
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
