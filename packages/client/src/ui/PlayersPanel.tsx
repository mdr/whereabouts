/**
 * Who else is in the game and how they are doing, tucked behind a small pill
 * in the HUD so the map stays clear. Starts collapsed; the choice sticks for
 * the session.
 */
import { signal } from "@preact/signals";
import type { GameView, PlayerView } from "@whereabouts/shared";
import { PlayerList } from "./PlayerList";
import { Icon } from "./icons";

const expanded = signal(false);

export function PlayersPanel({
  view,
  onKick,
  onMakeHost,
}: {
  view: GameView;
  onKick?: (player: PlayerView) => void;
  onMakeHost?: (player: PlayerView) => void;
}) {
  const players = view.players.filter((p) => !p.watching);
  const watching = view.players.length - players.length;
  const online = players.filter((p) => p.connected).length;
  const open = expanded.value;
  return (
    <div class={`players-panel ${open ? "open" : ""}`}>
      <button
        class="players-toggle"
        onClick={() => (expanded.value = !open)}
        aria-expanded={open}
        title={open ? "Hide players" : "Show players"}
      >
        <Icon name="users" />
        <span>
          {players.length} {players.length === 1 ? "player" : "players"}
          {online < players.length ? ` · ${online} online` : ""}
          {watching > 0 ? ` · ${watching} watching` : ""}
        </span>
        <Icon name={open ? "collapse" : "expand"} size={14} />
      </button>
      {open && (
        <div class="card players-card">
          <PlayerList
            players={players}
            you={view.you.id}
            showScores
            showLocked={view.phase === "guessing"}
            onKick={onKick}
            onMakeHost={onMakeHost}
          />
        </div>
      )}
    </div>
  );
}
