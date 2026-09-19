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
import { Icon } from "../ui/icons";
import { HostTag } from "../ui/PlayerList";
import { EndGameButton } from "../ui/HostControls";
import { kickRequest, useConfirm } from "../ui/ConfirmDialog";

export function Reveal({ conn, view, reveal }: { conn: Connection; view: GameView; reveal: RevealView }) {
  const paint = usePaint();
  const byId = new Map(view.players.map((p) => [p.id, p]));
  // null shows everyone's guesses at once; a player id shows just theirs.
  const [selected, setSelected] = useState<string | null>(null);
  const { dialog, ask } = useConfirm();

  useEffect(() => {
    paint.enabled.value = false;
    paint.gameMap.showReveal(reveal.answer, reveal.question.toleranceKm);
  }, [reveal.index]);

  // Borders and place names help make sense of the answer; they are hints
  // while guessing, so they go back off when the reveal unmounts.
  useEffect(() => {
    paint.gameMap.setBorders(true);
    paint.gameMap.setLabels(true);
    return () => {
      paint.gameMap.setBorders(false);
      paint.gameMap.setLabels(false);
    };
  }, []);

  // Show everyone's paint in their colours (best score drawn on top), or one
  // player's, framed together with the answer.
  useEffect(() => {
    const shown = reveal.results.filter((r) => r.paint && (selected === null || r.playerId === selected));
    const entries = [...shown].reverse().flatMap((r) => {
      const p = byId.get(r.playerId);
      return p && r.paint
        ? [{ layer: PaintLayer.fromRecord(r.res, r.paint.cells), colour: playerColour(p.colour) }]
        : [];
    });
    const fc = paint.showLayers(entries);
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
      {dialog}
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
          <QuestionCard q={reveal.question} credit>
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
              <li class={`everyone ${selected === null ? "selected" : ""}`} onClick={() => setSelected(null)}>
                <span class="swatch multi" />
                <span class="name">Everyone</span>
              </li>
              {rows.map(({ p, r }) => (
                <RevealRow
                  key={p.id}
                  p={p}
                  r={r}
                  you={p.id === view.you.id}
                  ready={ready.has(p.id)}
                  selected={p.id === selected}
                  onSelect={() => setSelected(selected === p.id ? null : p.id)}
                  onKick={
                    view.you.isHost && p.id !== view.you.id
                      ? () => ask(kickRequest(p.name, () => conn.kick(p.id)))
                      : undefined
                  }
                />
              ))}
            </ul>
            <p class="hint">Click a player to see just their guess.</p>
          </Card>
        </div>
        <div class="hud-bottom toolbar">
          <button class={iAmReady ? "" : "primary"} onClick={() => conn.ready()} disabled={iAmReady}>
            <Icon name="check" /> Ready
          </button>
          {view.you.isHost ? (
            <button class={iAmReady ? "primary" : ""} onClick={() => conn.next()} title="Go on without waiting">
              <Icon name={last ? "flag" : "next"} /> {last ? "Show final results" : "Next round"}
            </button>
          ) : (
            iAmReady && <span class="hint">Waiting for the others…</span>
          )}
          {view.you.isHost && !last && <EndGameButton onEnd={() => conn.end()} />}
        </div>
      </div>
      <DevDrawer>
        <Card title="Round results">
          <ul class="results">
            {reveal.results.map((r) => (
              <li key={r.playerId}>
                <span>
                  {byId.get(r.playerId)?.name ?? "?"}
                  {byId.get(r.playerId)?.isHost && <HostTag />}
                </span>
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
  onKick,
}: {
  p: PlayerView;
  r?: RoundResultView;
  you: boolean;
  ready: boolean;
  selected: boolean;
  onSelect: () => void;
  /** Host only: remove this player. */
  onKick?: () => void;
}) {
  const delta = p.previousRank !== null ? p.previousRank - p.rank : 0;
  return (
    <li class={`${selected ? "selected" : ""}`} onClick={onSelect}>
      <span class="swatch" style={{ background: playerColour(p.colour) }} />
      <span class="name">
        {p.name}
        {you ? " (you)" : ""}
        {p.isHost && <HostTag />}
        {ready && (
          <span class="tag ready" title="Ready for the next round">
            ✓
          </span>
        )}
      </span>
      {onKick && (
        <button
          class="icon kick"
          title={`Remove ${p.name} from the game`}
          aria-label={`Remove ${p.name} from the game`}
          onClick={(e) => {
            e.stopPropagation();
            onKick();
          }}
        >
          <Icon name="kick" size={13} />
        </button>
      )}
      <span class="round-score" title="This round">
        {r ? (r.paint ? `+${Math.round(r.score)}` : "no guess") : "sat out"}
      </span>
      <span class={`arrow ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
        {delta > 0 ? "▲" : delta < 0 ? "▼" : ""}
      </span>
      <span class="score-num" title="Total so far">
        {Math.round(p.score).toLocaleString()}
      </span>
    </li>
  );
}
