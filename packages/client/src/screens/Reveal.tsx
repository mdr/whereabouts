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
import { Card, HudBottom, HudHeader, QuestionCard, ScoreParts } from "../ui/bits";
import { ConnectionNote } from "../ui/ConnectionNote";
import { DevDrawer } from "../ui/DevDrawer";
import { ConnectionDev } from "../ui/ConnectionDev";
import { PaintDev } from "../ui/PaintTools";
import { Icon } from "../ui/icons";
import { HostTag } from "../ui/PlayerList";
import { EndGameButton } from "../ui/HostControls";
import { TakeSeatButton } from "../ui/TakeSeat";
import { kickRequest, useConfirm } from "../ui/ConfirmDialog";

/** Selection meaning "show nobody's paint", alongside null (everyone) and a player id. */
const NONE = "none";

/**
 * Rows for the reveal list: this round's winner first. Everyone who played,
 * passes included, comes in score order, then anyone who sat the round out;
 * ties keep the standings order. Spectators are not listed: they never play.
 */
export function revealOrder(
  players: PlayerView[],
  results: RoundResultView[],
): { p: PlayerView; r?: RoundResultView }[] {
  const group = (r?: RoundResultView) => (r ? 0 : 1);
  return players
    .filter((p) => !p.watching)
    .sort((a, b) => a.rank - b.rank)
    .map((p) => ({ p, r: results.find((x) => x.playerId === p.id) }))
    .sort((a, b) => group(a.r) - group(b.r) || (b.r?.score ?? 0) - (a.r?.score ?? 0));
}

export function Reveal({ conn, view, reveal }: { conn: Connection; view: GameView; reveal: RevealView }) {
  const paint = usePaint();
  const byId = new Map(view.players.map((p) => [p.id, p]));
  // null shows everyone's guesses at once; a player id shows just theirs; NONE hides all paint.
  const [selected, setSelected] = useState<string | null>(null);
  const { dialog, ask } = useConfirm();

  useEffect(() => {
    paint.enabled.value = false;
    paint.gameMap.showReveal(reveal.answer, reveal.question.toleranceKm);
  }, [reveal.index]);

  // Show everyone's paint in their colours (best score drawn on top), or one
  // player's, framed together with the answer.
  useEffect(() => {
    const shown =
      selected === NONE ? [] : reveal.results.filter((r) => r.paint && (selected === null || r.playerId === selected));
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
  const present = view.players.filter((p) => p.connected && !p.watching);
  const readyCount = present.filter((p) => ready.has(p.id)).length;
  const iAmReady = ready.has(view.you.id);
  const rows = revealOrder(view.players, reveal.results);

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
            <div class="label">
              {mine ? (mine.paint ? "your score this round" : "you passed this round") : "you sat this one out"}
            </div>
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
              <li
                class={`hide-paint ${selected === NONE ? "selected" : ""}`}
                onClick={() => setSelected(selected === NONE ? null : NONE)}
                title="Show the map and the answer without anyone's paint"
              >
                <span class="swatch-icon">
                  <Icon name="eyeOff" size={13} />
                </span>
                <span class="name">Hide paint</span>
              </li>
            </ul>
            <p class="hint">Click a player to see just their guess.</p>
          </Card>
          {/* Where it is while guessing too, and away from Next round below. */}
          {view.you.isHost && !last && <EndGameButton onEnd={() => conn.end()} />}
        </div>
        <HudBottom>
          {view.you.watching ? (
            <TakeSeatButton conn={conn} view={view} />
          ) : (
            <button class={iAmReady ? "" : "primary"} onClick={() => conn.ready()} disabled={iAmReady}>
              <Icon name="check" /> Ready
            </button>
          )}
          {view.you.isHost ? (
            <button
              class={iAmReady || view.you.watching ? "primary" : ""}
              onClick={() => conn.next()}
              title="Go on without waiting"
            >
              <Icon name={last ? "flag" : "next"} /> {last ? "Show final results" : "Next round"}
            </button>
          ) : (
            iAmReady && <span class="hint">Waiting for the others…</span>
          )}
        </HudBottom>
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
    <li class={`${selected ? "selected" : ""} ${you ? "you" : ""}`} onClick={onSelect}>
      <span class="swatch" style={{ background: playerColour(p.colour) }} />
      <span class="name">
        <span class="name-text">{p.name}</span>
        {p.isHost && <HostTag />}
        {r && !r.paint && (
          <span class="tag passed" title="Made no guess this round">
            passed
          </span>
        )}
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
        {r ? `+${Math.round(r.score)}` : "sat out"}
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
