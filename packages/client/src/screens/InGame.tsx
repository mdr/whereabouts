import { useEffect, useRef } from "preact/hooks";
import { PaintLayer, type GameView } from "@whereabouts/shared";
import type { Connection } from "../net";
import { usePaint } from "../ui/MapView";
import { Card, Countdown, QuestionCard } from "../ui/bits";
import { Distribution, PaintTools } from "../ui/PaintTools";
import { DifficultyOptions } from "../ui/Options";
import { PlayerList } from "../ui/PlayerList";
import { ConnectionNote } from "../ui/ConnectionNote";
import { Reveal } from "./Reveal";

export function InGame({ conn, view }: { conn: Connection; view: GameView }) {
  const paint = usePaint();
  const roundKey = view.round?.index ?? view.reveal?.index ?? -1;
  const guessing = view.phase === "guessing";
  const sendTimer = useRef<number | null>(null);
  const lastSentVersion = useRef(-1);

  // New round: fresh layer, painting on unless spectating. After a reconnect
  // the server hands back what we had painted, so restore it.
  useEffect(() => {
    if (!guessing || !view.round) return;
    paint.reset(view.round.question.toleranceKm);
    const saved = view.you.paint;
    if (saved) {
      paint.layer = PaintLayer.fromRecord(paint.layer.res, saved.cells);
      paint.floor.value = saved.floor;
      paint.version.value++;
    }
    paint.gameMap.clearReveal();
    paint.gameMap.resetView();
    paint.showOwn();
    paint.tool.value = "paint";
    lastSentVersion.current = paint.version.peek();
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
        {view.code} · round {(view.round?.index ?? view.reveal?.index ?? 0) + 1} /{" "}
        {view.round?.total ?? view.reveal?.total ?? "?"}
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
