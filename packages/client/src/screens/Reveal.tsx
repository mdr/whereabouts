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
import { Card, Countdown, HudHeader, QuestionCard, ScoreParts } from "../ui/bits";
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
            right={<Countdown msRemaining={() => conn.msUntil(reveal.autoAdvanceAt)} warnAt={-1} />}
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
                  selected={p.id === selected}
                  onSelect={() => setSelected(p.id)}
                />
              ))}
            </ul>
            <p class="hint">Click a player to see their guess.</p>
          </Card>
        </div>
        <div class="hud-bottom toolbar">
          {view.you.isHost ? (
            <button class="primary" onClick={() => conn.next()}>
              {last ? "Show final results" : "Next round"}
            </button>
          ) : (
            <span class="hint">{last ? "Final results soon." : "Next round soon."}</span>
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
  selected,
  onSelect,
}: {
  p: PlayerView;
  r?: RoundResultView;
  you: boolean;
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
      </span>
      <span class="round-score">{r ? (r.paint ? `+${Math.round(r.score)}` : "no guess") : "sat out"}</span>
      <span class={`arrow ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
        {delta > 0 ? "▲" : delta < 0 ? "▼" : ""}
      </span>
      <span class="score-num">{Math.round(p.score).toLocaleString()}</span>
    </li>
  );
}
