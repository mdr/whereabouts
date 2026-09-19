/** Online game: lobby, timed guessing, reveal, results. One Connection per mount. */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useSignal } from "@preact/signals";
import {
  PaintLayer,
  playerColour,
  type GameView,
  type PlayerView,
  type RevealView,
  type RoundResultView,
} from "@whereabouts/shared";
import { Connection } from "../net";
import { playerName, playerToken } from "../settings";
import { navigate } from "../router";
import { MapView, usePaint } from "../ui/MapView";
import { Card, Countdown, QuestionCard } from "../ui/bits";
import { Distribution, PaintTools } from "../ui/PaintTools";
import { DifficultyOptions } from "../ui/Options";

export function Multiplayer({ code, create }: { code: string; create: boolean }) {
  const conn = useMemo(() => new Connection(), []);
  const name = playerName.value.trim();

  useEffect(() => {
    if (!name) {
      navigate("/");
      return;
    }
    conn.connect(create ? { token: playerToken.value, name, create: true } : { token: playerToken.value, name, code });
    return () => conn.disconnect();
  }, [conn]);

  // Once the server assigns a code to a new game, put it in the URL for sharing.
  const assigned = conn.code.value;
  useEffect(() => {
    if (create && assigned) history.replaceState(null, "", `#/game/${assigned}`);
  }, [assigned]);

  const status = conn.status.value;
  const view = conn.view.value;

  if (status === "rejected" || (status === "disconnected" && !view)) {
    return (
      <div class="home">
        <div class="home-card">
          <h1>Whereabouts</h1>
          <p class="warn">{conn.lastError.value ?? "Could not join that game."}</p>
          <button class="primary" onClick={() => navigate("/")}>
            Back
          </button>
        </div>
      </div>
    );
  }
  if (!view) {
    return (
      <div class="home">
        <div class="home-card">
          <h1>Whereabouts</h1>
          <p class="hint">{create ? "Creating your game…" : `Joining ${code}…`}</p>
        </div>
      </div>
    );
  }
  if (view.phase === "lobby") return <Lobby conn={conn} view={view} />;
  if (view.phase === "results") return <Results conn={conn} view={view} />;
  return (
    <MapView>
      <InGame conn={conn} view={view} />
    </MapView>
  );
}

// ---- lobby -------------------------------------------------------------------

function Lobby({ conn, view }: { conn: Connection; view: GameView }) {
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

function ConnectionNote({ conn }: { conn: Connection }) {
  const s = conn.status.value;
  const err = conn.lastError.value;
  if (s === "connected" && !err) return null;
  return <p class={`hint ${s !== "connected" ? "warn" : ""}`}>{s !== "connected" ? "Reconnecting…" : err}</p>;
}

// ---- in game (guessing + reveal share the map) ------------------------------

function InGame({ conn, view }: { conn: Connection; view: GameView }) {
  const paint = usePaint();
  const roundKey = view.round?.index ?? view.reveal?.index ?? -1;
  const guessing = view.phase === "guessing";
  const sendTimer = useRef<number | null>(null);
  const lastSentVersion = useRef(-1);

  // New round: fresh layer, painting on unless spectating.
  useEffect(() => {
    if (!guessing || !view.round) return;
    paint.reset(view.round.question.toleranceKm);
    paint.gameMap.clearReveal();
    paint.showOwn();
    paint.tool.value = "paint";
    lastSentVersion.current = -1;
  }, [roundKey, guessing]);

  useEffect(() => {
    paint.enabled.value = guessing && !view.you.spectating && !view.you.locked;
  }, [guessing, view.you.spectating, view.you.locked]);

  // Debounced upload of the current paint while guessing.
  const version = paint.version.value;
  const floor = paint.floor.value;
  useEffect(() => {
    if (!guessing || view.you.spectating || view.you.locked) return;
    if (sendTimer.current) clearTimeout(sendTimer.current);
    sendTimer.current = window.setTimeout(() => {
      sendTimer.current = null;
      if (paint.layer.isEmpty) return;
      conn.sendPaint({ cells: paint.layer.toRecord(), floor });
      lastSentVersion.current = paint.version.peek();
    }, 400);
    return () => {
      if (sendTimer.current) clearTimeout(sendTimer.current);
    };
  }, [version, floor, guessing]);

  function lockIn() {
    if (paint.layer.isEmpty) return;
    if (sendTimer.current) clearTimeout(sendTimer.current);
    conn.sendPaint({ cells: paint.layer.toRecord(), floor: paint.floor.value });
    conn.lock();
  }

  const header = (
    <h1>
      Whereabouts{" "}
      <small>
        {view.code} · round {(view.round?.index ?? view.reveal?.index ?? 0) + 1} / {view.round?.total ?? view.reveal?.total ?? "?"}
      </small>
    </h1>
  );

  if (view.phase === "reveal" && view.reveal) {
    return (
      <>
        {header}
        <Reveal conn={conn} view={view} reveal={view.reveal} />
        <DifficultyOptions />
      </>
    );
  }

  const round = view.round!;
  return (
    <>
      {header}
      <div class="timer-row">
        <Countdown msRemaining={() => conn.msUntil(round.deadline)} />
        <span class="hint">Whatever is painted when the clock hits zero is your guess.</span>
      </div>
      <QuestionCard q={round.question} res={paint.layer.res} />
      {view.you.spectating ? (
        <Card>
          <p class="hint">You joined mid-round, so you're watching this one. You'll play from the next question.</p>
        </Card>
      ) : (
        <Card title="Paint your hunch">
          <PaintTools />
          <div class="actions">
            <button class="danger" onClick={() => paint.clear()} disabled={!paint.enabled.value}>
              Clear
            </button>
            <button class="primary" onClick={lockIn} disabled={view.you.locked || paint.layer.isEmpty}>
              {view.you.locked ? "Locked in" : "Lock in"}
            </button>
          </div>
          {view.you.locked && <p class="hint">Locked. Sit tight until the clock runs out.</p>}
        </Card>
      )}
      <Card title="Your distribution">
        <Distribution />
      </Card>
      <Card title="Players">
        <PlayerList players={view.players} you={view.you.id} showScores />
      </Card>
      <ConnectionNote conn={conn} />
      <DifficultyOptions />
    </>
  );
}

// ---- reveal ------------------------------------------------------------------

function Reveal({ conn, view, reveal }: { conn: Connection; view: GameView; reveal: RevealView }) {
  const paint = usePaint();
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const [selected, setSelected] = useState<string>(view.you.id);
  const shownOnce = useRef(false);
  void shownOnce;

  useEffect(() => {
    paint.enabled.value = false;
    paint.gameMap.showReveal(reveal.answer, reveal.question.toleranceKm);
    shownOnce.current = false;
  }, [reveal.index]);

  // Show the selected player's paint in their colour, framed with the answer.
  useEffect(() => {
    const r = reveal.results.find((x) => x.playerId === selected);
    const p = byId.get(selected);
    const layer = r?.paint && p ? PaintLayer.fromRecord(r.res, r.paint.cells) : null;
    paint.showLayer(layer, p ? playerColour(p.colour) : null);
    const fc = layer ? layer.toGeoJSON() : { type: "FeatureCollection" as const, features: [] };
    paint.gameMap.fitAnswerAndPaint(reveal.answer, fc, reveal.question.toleranceKm);
    shownOnce.current = true;
  }, [selected, reveal.index]);

  const mine = reveal.results.find((r) => r.playerId === view.you.id);
  return (
    <>
      <div class="timer-row">
        <Countdown msRemaining={() => conn.msUntil(reveal.autoAdvanceAt)} warnAt={-1} />
        <span class="hint">{view.you.isHost ? "Next round starts when you press next or the clock runs out." : "Next round soon."}</span>
      </div>
      <QuestionCard q={reveal.question} />
      <div class="card score">
        <div class="label">{reveal.label}</div>
        <div class="big">{mine ? Math.round(mine.score) : "—"}</div>
        <div class="label">{mine ? "your score this round" : "you sat this one out"}</div>
      </div>
      <Card title="Guesses">
        <ul class="reveal-list">
          {reveal.results.map((r) => (
            <RevealRow key={r.playerId} r={r} p={byId.get(r.playerId)} you={r.playerId === view.you.id} selected={r.playerId === selected} onSelect={() => setSelected(r.playerId)} />
          ))}
        </ul>
        <p class="hint">Click a player to see their paint on the map.</p>
      </Card>
      <Card title="Standings">
        <PlayerList players={view.players} you={view.you.id} showScores arrows />
      </Card>
      {view.you.isHost && (
        <div class="actions">
          <button class="primary" onClick={() => conn.next()}>
            {reveal.index + 1 >= reveal.total ? "Show final results" : "Next round"}
          </button>
        </div>
      )}
      <ConnectionNote conn={conn} />
    </>
  );
}

function RevealRow({ r, p, you, selected, onSelect }: { r: RoundResultView; p?: PlayerView; you: boolean; selected: boolean; onSelect: () => void }) {
  return (
    <li class={`${selected ? "selected" : ""}`} onClick={onSelect}>
      <span class="swatch" style={{ background: p ? playerColour(p.colour) : "#888" }} />
      <span class="name">
        {p?.name ?? "?"}
        {you ? " (you)" : ""}
      </span>
      <span class="muted">{r.paint ? "" : "no guess"}</span>
      <span class="score-num">{Math.round(r.score)}</span>
    </li>
  );
}

// ---- results -----------------------------------------------------------------

function Results({ conn, view }: { conn: Connection; view: GameView }) {
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const standings = view.results ?? [];
  const winner = standings[0] ? byId.get(standings[0].playerId) : undefined;
  return (
    <div class="home">
      <div class="home-card results-card">
        <h1>Whereabouts</h1>
        {winner && (
          <p class="tagline">
            <span class="swatch" style={{ background: playerColour(winner.colour) }} /> <b>{winner.name}</b> wins
          </p>
        )}
        <ol class="final">
          {standings.map((s, i) => {
            const p = byId.get(s.playerId);
            return (
              <li key={s.playerId} class={s.playerId === view.you.id ? "you" : ""}>
                <span class="place">{i + 1}</span>
                <span class="swatch" style={{ background: p ? playerColour(p.colour) : "#888" }} />
                <span class="name">{p?.name ?? "?"}</span>
                <span class="rounds">{s.rounds.map((r) => Math.round(r)).join(" · ")}</span>
                <span class="score-num">{Math.round(s.total).toLocaleString()}</span>
              </li>
            );
          })}
        </ol>
        {view.you.isHost ? (
          <button class="primary big" onClick={() => conn.again()}>
            Play again
          </button>
        ) : (
          <p class="hint">The host can start another game with the same group.</p>
        )}
        <p class="hint">
          <a href="#/">Leave</a>
        </p>
      </div>
    </div>
  );
}

// ---- shared ------------------------------------------------------------------

function PlayerList({ players, you, showScores, arrows }: { players: PlayerView[]; you: string; showScores: boolean; arrows?: boolean }) {
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
                {arrows && <span class={`arrow ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>{delta > 0 ? "▲" : delta < 0 ? "▼" : ""}</span>}
                <span class="score-num">{Math.round(p.score).toLocaleString()}</span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
