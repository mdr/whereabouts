import { useState } from "preact/hooks";
import type { GameView } from "@whereabouts/shared";
import type { Connection } from "../net";
import { playerName } from "../settings";
import { PlayerList } from "../ui/PlayerList";
import { ConnectionNote } from "../ui/ConnectionNote";
import { Icon } from "../ui/icons";

export function Lobby({ conn, view }: { conn: Connection; view: GameView }) {
  const url = `${location.origin}${location.pathname}#/game/${view.code}`;
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const current = view.players.find((p) => p.id === view.you.id)?.name ?? "";
  return (
    <div class="home">
      <div class="home-card lobby">
        <h1>Whereabouts</h1>
        <p class="tagline">Share this code with your friends</p>
        <div class="code">{view.code}</div>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(url).then(() => setCopied(true));
          }}
        >
          <Icon name={copied ? "check" : "link"} /> {copied ? "Link copied" : "Copy invite link"}
        </button>
        <ConnectionNote conn={conn} />
        <h2>Players</h2>
        <PlayerList players={view.players} you={view.you.id} showScores={false} onRename={() => setRenaming(true)} />
        {renaming && (
          <RenameForm
            current={current}
            onDone={(name) => {
              if (name && name !== current) {
                conn.rename(name);
                playerName.value = name;
              }
              setRenaming(false);
            }}
          />
        )}
        <p class="hint">
          {view.config.rounds} rounds · {view.config.roundMs / 1000} seconds each
        </p>
        {view.you.isHost ? (
          <button class="primary big" onClick={() => conn.start()} disabled={view.players.length < 1}>
            <Icon name="play" /> Start game
          </button>
        ) : (
          <p class="hint">Waiting for the host to start…</p>
        )}
      </div>
    </div>
  );
}

function RenameForm({ current, onDone }: { current: string; onDone: (name: string | null) => void }) {
  const [name, setName] = useState(current);
  return (
    <form
      class="join"
      onSubmit={(e) => {
        e.preventDefault();
        onDone(name.trim());
      }}
    >
      <input
        class="code-input name-input"
        type="text"
        maxLength={20}
        value={name}
        onInput={(e) => setName((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onDone(null);
        }}
        autoFocus
      />
      <button type="submit" disabled={name.trim().length === 0}>
        Save
      </button>
    </form>
  );
}
