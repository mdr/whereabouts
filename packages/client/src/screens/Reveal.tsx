import { useEffect, useRef, useState } from "preact/hooks";
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
import { Card, Countdown, QuestionCard } from "../ui/bits";
import { PlayerList } from "../ui/PlayerList";
import { ConnectionNote } from "../ui/ConnectionNote";

export function Reveal({ conn, view, reveal }: { conn: Connection; view: GameView; reveal: RevealView }) {
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
        <span class="hint">
          {view.you.isHost ? "Next round starts when you press next or the clock runs out." : "Next round soon."}
        </span>
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
            <RevealRow
              key={r.playerId}
              r={r}
              p={byId.get(r.playerId)}
              you={r.playerId === view.you.id}
              selected={r.playerId === selected}
              onSelect={() => setSelected(r.playerId)}
            />
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

function RevealRow({
  r,
  p,
  you,
  selected,
  onSelect,
}: {
  r: RoundResultView;
  p?: PlayerView;
  you: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
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
