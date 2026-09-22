import { useState } from "preact/hooks";
import { MAX_ROUNDS, MIN_ROUNDS, PHOTO_MIXES, ROUND_LENGTHS_MS, type GameView } from "@whereabouts/shared";
import type { Connection } from "../net";
import { playerName, startOnPan } from "../settings";
import { HostWord, PlayerList } from "../ui/PlayerList";
import { ConnectionNote } from "../ui/ConnectionNote";
import { Icon } from "../ui/icons";
import { Pills, Stepper } from "../ui/Controls";
import { kickRequest, useConfirm } from "../ui/ConfirmDialog";

const SECONDS = ROUND_LENGTHS_MS.map((ms) => ({ value: ms, label: String(ms / 1000) }));
const MIXES = PHOTO_MIXES.map((m) => ({ value: m.share, label: m.label }));

/**
 * Waiting room: invite on the left (code, link, players), the game setup on
 * the right. Guests see the same controls as the host, read-only, so they
 * follow along as settings change.
 */
export function Lobby({ conn, view }: { conn: Connection; view: GameView }) {
  const url = `${location.origin}${location.pathname}#/game/${view.code}`;
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const { dialog, ask } = useConfirm();
  const current = view.players.find((p) => p.id === view.you.id)?.name ?? "";
  const host = view.you.isHost;
  const canShare = typeof navigator.share === "function";
  return (
    <div class="home">
      <div class="home-card lobby">
        {dialog}
        <h1>Whereabouts</h1>
        <div class="lobby-cols">
          <section class="lobby-panel">
            <h2>Invite</h2>
            <p class="tagline">Share this code with your friends</p>
            <div class="code">{view.code}</div>
            <div class="invite-actions">
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(url).then(() => setCopied(true));
                }}
              >
                <Icon name={copied ? "check" : "link"} /> {copied ? "Link copied" : "Copy link"}
              </button>
              {canShare && (
                <button
                  onClick={() => {
                    void navigator
                      .share({ title: "Whereabouts", text: `Join my game: ${view.code}`, url })
                      .catch(() => {});
                  }}
                >
                  <Icon name="share" /> Share
                </button>
              )}
            </div>
            <ConnectionNote conn={conn} />
            <h2>
              Players <span class="count">{view.players.length}</span>
            </h2>
            <PlayerList
              players={view.players}
              you={view.you.id}
              showScores={false}
              avatars
              onRename={() => setRenaming(true)}
              onKick={host ? (p) => ask(kickRequest(p.name, () => conn.kick(p.id))) : undefined}
            />
            {view.players.length === 1 && <p class="hint waiting">Waiting for friends to join…</p>}
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
          </section>

          <section class="lobby-panel">
            <h2>Game setup</h2>
            <div class="setting rounds">
              <span class="setting-label">Rounds</span>
              <Stepper
                label="Rounds"
                value={view.config.rounds}
                min={MIN_ROUNDS}
                max={MAX_ROUNDS}
                onChange={host ? (rounds) => conn.configure({ rounds }) : undefined}
              />
            </div>
            <div class="setting seconds">
              <span class="setting-label">Seconds per round</span>
              <Pills
                label="Seconds per round"
                options={SECONDS}
                value={view.config.roundMs}
                onChange={host ? (roundMs) => conn.configure({ roundMs }) : undefined}
              />
            </div>
            <div class="setting questions">
              <span class="setting-label">Questions</span>
              <Pills
                label="Questions"
                options={MIXES}
                value={view.config.photoShare}
                onChange={host ? (photoShare) => conn.configure({ photoShare }) : undefined}
              />
            </div>
            {!host && (
              <p class="hint">
                <HostWord capital /> picks these.
              </p>
            )}
            <h2>This device</h2>
            <label class="check switch start-on-pan">
              <input
                type="checkbox"
                role="switch"
                checked={startOnPan.value}
                onChange={(e) => (startOnPan.value = (e.target as HTMLInputElement).checked)}
              />
              Start each round with the Pan tool (handy on a tablet)
            </label>
            <div class="lobby-start">
              {host ? (
                <button class="primary big" onClick={() => conn.start()} disabled={view.players.length < 1}>
                  <Icon name="play" /> Start game
                </button>
              ) : (
                <p class="hint">
                  Waiting for <HostWord /> to start…
                </p>
              )}
            </div>
          </section>
        </div>
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
