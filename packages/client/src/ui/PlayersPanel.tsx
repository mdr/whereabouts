/**
 * Who else is in the game and how they are doing, tucked behind a small pill
 * in the HUD so the map stays clear. Starts collapsed; the choice sticks for
 * the session.
 */
import { signal } from "@preact/signals";
import type { GameView } from "@whereabouts/shared";
import { PlayerList } from "./PlayerList";
import { Icon } from "./icons";

const expanded = signal(false);

export function PlayersPanel({ view }: { view: GameView }) {
  const online = view.players.filter((p) => p.connected).length;
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
          {view.players.length} {view.players.length === 1 ? "player" : "players"}
          {online < view.players.length ? ` · ${online} online` : ""}
        </span>
        <Icon name={open ? "collapse" : "expand"} size={14} />
      </button>
      {open && (
        <div class="card players-card">
          <PlayerList players={view.players} you={view.you.id} showScores showLocked={view.phase === "guessing"} />
        </div>
      )}
    </div>
  );
}
