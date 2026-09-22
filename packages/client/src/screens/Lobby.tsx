import { useState } from "preact/hooks";
import { MAX_ROUNDS, MIN_ROUNDS, PHOTO_MIXES, ROUND_LENGTHS_MS, type GameView } from "@whereabouts/shared";
import type { Connection } from "../net";
import { playerName, startOnPan } from "../settings";
import { HostWord, PlayerList } from "../ui/PlayerList";
import { ConnectionNote } from "../ui/ConnectionNote";
import { Icon } from "../ui/icons";
import { kickRequest, useConfirm } from "../ui/ConfirmDialog";

export function Lobby({ conn, view }: { conn: Connection; view: GameView }) {
  const url = `${location.origin}${location.pathname}#/game/${view.code}`;
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const { dialog, ask } = useConfirm();
  const current = view.players.find((p) => p.id === view.you.id)?.name ?? "";
  return (
    <div class="home">
      <div class="home-card lobby">
        {dialog}
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
        <PlayerList
          players={view.players}
          you={view.you.id}
          showScores={false}
          onRename={() => setRenaming(true)}
          onKick={view.you.isHost ? (p) => ask(kickRequest(p.name, () => conn.kick(p.id))) : undefined}
        />
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
        <h2>Game setup</h2>
        {view.you.isHost ? (
          <div class="settings">
            <label>
              Rounds
              <select
                value={view.config.rounds}
                onChange={(e) => conn.configure({ rounds: Number((e.target as HTMLSelectElement).value) })}
              >
                {Array.from({ length: MAX_ROUNDS - MIN_ROUNDS + 1 }, (_, i) => MIN_ROUNDS + i).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Seconds per round
              <select
                value={view.config.roundMs}
                onChange={(e) => conn.configure({ roundMs: Number((e.target as HTMLSelectElement).value) })}
              >
                {ROUND_LENGTHS_MS.map((ms) => (
                  <option key={ms} value={ms}>
                    {ms / 1000}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Questions
              <select
                value={view.config.photoShare}
                onChange={(e) => conn.configure({ photoShare: Number((e.target as HTMLSelectElement).value) })}
              >
                {PHOTO_MIXES.map((m) => (
                  <option key={m.share} value={m.share}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <p class="hint">
            {view.config.rounds} rounds · {view.config.roundMs / 1000} seconds each · {mixLabel(view.config.photoShare)}
            . <HostWord capital /> can change this.
          </p>
        )}
        {/* Per-device preference, so it lives here rather than in the host's config. */}
        <label class="check start-on-pan">
          <input
            type="checkbox"
            checked={startOnPan.value}
            onChange={(e) => (startOnPan.value = (e.target as HTMLInputElement).checked)}
          />
          Start each round with the Pan tool (handy on a tablet)
        </label>
        {view.you.isHost ? (
          <button class="primary big" onClick={() => conn.start()} disabled={view.players.length < 1}>
            <Icon name="play" /> Start game
          </button>
        ) : (
          <p class="hint">
            Waiting for <HostWord /> to start…
          </p>
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

function mixLabel(share: number): string {
  return (PHOTO_MIXES.find((m) => m.share === share)?.label ?? "Even mix").toLowerCase();
}
