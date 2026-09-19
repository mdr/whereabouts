import { useEffect, useState } from "preact/hooks";
import {
  PaintLayer,
  playerColour,
  type GameView,
  type PlayerView,
  type RevealView,
  type RoundResultView,
} from "@whereabouts/shared";
import type { Connection } from "../net";
import { usePaint } from "../ui/MapView";
import { Card, HudHeader, QuestionCard, ScoreParts } from "../ui/bits";
import { ConnectionNote } from "../ui/ConnectionNote";
import { DevDrawer } from "../ui/DevDrawer";
import { ConnectionDev } from "../ui/ConnectionDev";
import { PaintDev } from "../ui/PaintTools";

export function Reveal({ conn, view, reveal }: { conn: Connection; view: GameView; reveal: RevealView }) {
  const paint = usePaint();
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const [selected, setSelected] = useState<string>(view.you.id);

  useEffect(() => {
    paint.enabled.value = false;
    paint.gameMap.showReveal(reveal.answer, reveal.question.toleranceKm);
  }, [reveal.index]);

  // Show the selected player's paint in their colour, framed with the answer.
  useEffect(() => {
    const r = reveal.results.find((x) => x.playerId === selected);
    const p = byId.get(selected);
    const layer = r?.paint && p ? PaintLayer.fromRecord(r.res, r.paint.cells) : null;
    paint.showLayer(layer, p ? playerColour(p.colour) : null);
    const fc = layer ? layer.toGeoJSON() : { type: "FeatureCollection" as const, features: [] };
    paint.gameMap.fitAnswerAndPaint(reveal.answer, fc, reveal.question.toleranceKm);
  }, [selected, reveal.index]);

  const mine = reveal.results.find((r) => r.playerId === view.you.id);
  const last = reveal.index + 1 >= reveal.total;
  const ready = new Set(reveal.ready);
  const present = view.players.filter((p) => p.connected);
  const readyCount = present.filter((p) => ready.has(p.id)).length;
  const iAmReady = ready.has(view.you.id);
  // Standings order, with this round's result alongside.
  const rows = [...view.players]
    .sort((a, b) => a.rank - b.rank)
    .map((p) => ({ p, r: reveal.results.find((x) => x.playerId === p.id) }));

  return (
    <>
      <div class="hud">
        <div class="hud-top">
          <HudHeader
            round={reveal.index + 1}
            total={reveal.total}
            right={
              <span class="ready-count" title="The next round starts when everyone is ready">
                {readyCount} / {present.length} ready
              </span>
            }
          />
          <QuestionCard q={reveal.question}>
            <p class="answer">
              It's <b>{reveal.label}</b>
            </p>
          </QuestionCard>
          <div class="card score">
            <div class="big">{mine ? Math.round(mine.score) : "—"}</div>
            <div class="label">{mine ? "your score this round" : "you sat this one out"}</div>
          </div>
          <ConnectionNote conn={conn} />
        </div>
        <div class="hud-right">
          <Card title="Scores">
            <ul class="reveal-list">
              {rows.map(({ p, r }) => (
                <RevealRow
                  key={p.id}
                  p={p}
                  r={r}
                  you={p.id === view.you.id}
                  ready={ready.has(p.id)}
                  selected={p.id === selected}
                  onSelect={() => setSelected(p.id)}
                />
              ))}
            </ul>
            <p class="hint">Click a player to see their guess.</p>
          </Card>
        </div>
        <div class="hud-bottom toolbar">
          <button class={iAmReady ? "" : "primary"} onClick={() => conn.ready()} disabled={iAmReady}>
            {iAmReady ? "Ready ✓" : "Ready"}
          </button>
          {view.you.isHost ? (
            <button class={iAmReady ? "primary" : ""} onClick={() => conn.next()} title="Go on without waiting">
              {last ? "Show final results" : "Next round"}
            </button>
          ) : (
            iAmReady && <span class="hint">Waiting for the others…</span>
          )}
        </div>
      </div>
      <DevDrawer>
        <Card title="Round results">
          <ul class="results">
            {reveal.results.map((r) => (
              <li key={r.playerId}>
                <span>{byId.get(r.playerId)?.name ?? "?"}</span>
                <ScoreParts A={r.A} B={r.B} />
              </li>
            ))}
          </ul>
        </Card>
        <PaintDev />
        <ConnectionDev conn={conn} view={view} />
      </DevDrawer>
    </>
  );
}

function RevealRow({
  p,
  r,
  you,
  ready,
  selected,
  onSelect,
}: {
  p: PlayerView;
  r?: RoundResultView;
  you: boolean;
  ready: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const delta = p.previousRank !== null ? p.previousRank - p.rank : 0;
  return (
    <li class={`${selected ? "selected" : ""}`} onClick={onSelect}>
      <span class="swatch" style={{ background: playerColour(p.colour) }} />
      <span class="name">
        {p.name}
        {you ? " (you)" : ""}
        {ready && (
          <span class="tag ready" title="Ready for the next round">
            ✓
          </span>
        )}
      </span>
      <span class="round-score">{r ? (r.paint ? `+${Math.round(r.score)}` : "no guess") : "sat out"}</span>
      <span class={`arrow ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
        {delta > 0 ? "▲" : delta < 0 ? "▼" : ""}
      </span>
      <span class="score-num">{Math.round(p.score).toLocaleString()}</span>
    </li>
  );
}
