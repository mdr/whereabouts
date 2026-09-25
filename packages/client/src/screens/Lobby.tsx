import { useEffect, useRef, useState } from "preact/hooks";
import {
  MAX_PLAYERS,
  MAX_ROUNDS,
  MIN_ROUNDS,
  PHOTO_MIXES,
  ROUND_LENGTHS_MS,
  nextHostAfter,
  type GameView,
} from "@whereabouts/shared";
import type { Connection } from "../net";
import { configureAsHost } from "../host-setup";
import { joinedCode, playerName, soundOn, startOnPan } from "../settings";
import { HostWord, PlayerList } from "../ui/PlayerList";
import { ConnectionNote } from "../ui/ConnectionNote";
import { Icon } from "../ui/icons";
import { Pills, StopSlider, Stepper } from "../ui/Controls";
import { kickRequest, leaveRequest, makeHostRequest, useConfirm } from "../ui/ConfirmDialog";
import { navigate } from "../router";
import { Banner } from "../ui/Banner";
import { MapDetailPicker, MapDetailSummary } from "../ui/MapDetailPicker";

const SECONDS = ROUND_LENGTHS_MS.map((ms) => ({ value: ms, label: String(ms / 1000) }));
const MIXES = PHOTO_MIXES.map((m) => ({ value: m.share, label: m.label }));

/**
 * Waiting room: invite on the left (code, link, players), the game setup on
 * the right. The host gets the controls; guests see the decided values,
 * which highlight briefly when the host changes one.
 */
export function Lobby({ conn, view }: { conn: Connection; view: GameView }) {
  const url = `${location.origin}${location.pathname}#/game/${view.code}`;
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const { dialog, ask } = useConfirm();
  const current = view.players.find((p) => p.id === view.you.id)?.name ?? "";
  const host = view.you.isHost;
  const canShare = typeof navigator.share === "function";
  // Home, giving up the seat now; the tab forgets the game so a refresh or
  // Back does not quietly rejoin it. Leaving the screen disconnects.
  const leave = () => {
    conn.leave();
    joinedCode.value = "";
    navigate("/");
  };
  return (
    <div class="home">
      <div class="home-card lobby">
        {dialog}
        <Banner>
          <button
            class="banner-leave"
            onClick={() => (host ? ask(leaveRequest(nextHostAfter(view.players, view.you.id)?.name, leave)) : leave())}
          >
            <Icon name="back" size={15} /> Leave
          </button>
        </Banner>
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
              Players{" "}
              <span class="count" title={`Up to ${MAX_PLAYERS} players`}>
                {view.players.length}/{MAX_PLAYERS}
              </span>
            </h2>
            <PlayerList
              players={view.players}
              you={view.you.id}
              showScores={false}
              avatars
              onRename={() => setRenaming(true)}
              onKick={host ? (p) => ask(kickRequest(p.name, () => conn.kick(p.id))) : undefined}
              onMakeHost={host ? (p) => ask(makeHostRequest(p.name, () => conn.makeHost(p.id))) : undefined}
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
            {host ? (
              <>
                <div class="setting rounds">
                  <span class="setting-label">Rounds</span>
                  <Stepper
                    label="Rounds"
                    value={view.config.rounds}
                    min={MIN_ROUNDS}
                    max={MAX_ROUNDS}
                    onChange={(rounds) => configureAsHost(conn, { rounds })}
                  />
                </div>
                <div class="setting seconds">
                  <span class="setting-label">Seconds per round</span>
                  <Pills
                    label="Seconds per round"
                    options={SECONDS}
                    value={view.config.roundMs}
                    onChange={(roundMs) => configureAsHost(conn, { roundMs })}
                  />
                </div>
                <div class="setting questions">
                  <span class="setting-label">Questions</span>
                  <StopSlider
                    label="Questions"
                    options={MIXES}
                    value={view.config.photoShare}
                    onChange={(photoShare) => configureAsHost(conn, { photoShare })}
                  />
                </div>
                <div class="setting map-detail">
                  <span class="setting-label">Map detail</span>
                  <MapDetailPicker
                    value={view.config.mapDetail}
                    onChange={(mapDetail) => configureAsHost(conn, { mapDetail })}
                  />
                </div>
              </>
            ) : (
              <>
                <SetupSummary view={view} />
                <p class="hint">
                  <HostWord capital /> picks these.
                </p>
              </>
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
            <label class="check switch sound-switch">
              <input
                type="checkbox"
                role="switch"
                checked={soundOn.value}
                onChange={(e) => (soundOn.value = (e.target as HTMLInputElement).checked)}
              />
              Sounds (spray, countdown and round cues)
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

/**
 * What a guest sees of the setup: the decided values as tiles. A tile whose
 * value just changed is remounted (it is keyed on the value) with a class
 * that plays a short highlight; nothing flashes on first load.
 */
function SetupSummary({ view }: { view: GameView }) {
  const { rounds, roundMs, photoShare, mapDetail } = view.config;
  const shown = useRef(view.config);
  const before = shown.current;
  useEffect(() => {
    shown.current = view.config;
  });
  const mix = MIXES.find((m) => m.value === photoShare)?.label ?? "Even";
  const tiles = [
    {
      key: "rounds",
      value: String(rounds),
      label: rounds === 1 ? "round" : "rounds",
      changed: rounds !== before.rounds,
    },
    { key: "seconds", value: `${roundMs / 1000} s`, label: "per round", changed: roundMs !== before.roundMs },
    { key: "questions", value: mix, label: "questions", changed: photoShare !== before.photoShare },
  ];
  return (
    <div class="setup-summary">
      {tiles.map((t) => (
        <div key={`${t.key}:${t.value}`} class={`tile ${t.key} ${t.changed ? "changed" : ""}`}>
          <span class="value">{t.value}</span>
          <span class="label">{t.label}</span>
        </div>
      ))}
      <div key={`map:${mapDetail}`} class={`tile map-detail ${mapDetail !== before.mapDetail ? "changed" : ""}`}>
        <MapDetailSummary value={mapDetail} />
      </div>
    </div>
  );
}
