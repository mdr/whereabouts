import { useState } from "preact/hooks";
import type { GameView } from "@whereabouts/shared";
import type { Connection } from "../net";
import { PlayerList } from "../ui/PlayerList";
import { ConnectionNote } from "../ui/ConnectionNote";

export function Lobby({ conn, view }: { conn: Connection; view: GameView }) {
  const url = `${location.origin}${location.pathname}#/game/${view.code}`;
  const [copied, setCopied] = useState(false);
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
          {copied ? "Link copied" : "Copy invite link"}
        </button>
        <ConnectionNote conn={conn} />
        <h2>Players</h2>
        <PlayerList players={view.players} you={view.you.id} showScores={false} />
        <p class="hint">
          {view.config.rounds} rounds · {view.config.roundMs / 1000} seconds each
        </p>
        {view.you.isHost ? (
          <button class="primary big" onClick={() => conn.start()} disabled={view.players.length < 1}>
            Start game
          </button>
        ) : (
          <p class="hint">Waiting for the host to start…</p>
        )}
      </div>
    </div>
  );
}
