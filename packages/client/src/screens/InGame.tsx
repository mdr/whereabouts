import { useEffect, useRef } from "preact/hooks";
import { PaintLayer, compactRecord, playerColour, type GameView } from "@whereabouts/shared";
import type { Connection } from "../net";
import { usePaint } from "../ui/MapView";
import { Card, Countdown, HudHeader, QuestionCard } from "../ui/bits";
import { PaintDev, PaintTools } from "../ui/PaintTools";
import { PlayerList } from "../ui/PlayerList";
import { ConnectionNote } from "../ui/ConnectionNote";
import { DevDrawer } from "../ui/DevDrawer";
import { ConnectionDev } from "../ui/ConnectionDev";
import { Reveal } from "./Reveal";
import { Icon } from "../ui/icons";
import { PlayersPanel } from "../ui/PlayersPanel";
import { EndGameButton } from "../ui/HostControls";
import { kickRequest, useConfirm } from "../ui/ConfirmDialog";

export function InGame({ conn, view }: { conn: Connection; view: GameView }) {
  const paint = usePaint();
  const roundKey = view.round?.index ?? view.reveal?.index ?? -1;
  const guessing = view.phase === "guessing";
  const sendTimer = useRef<number | null>(null);
  const lastSentVersion = useRef(-1);
  const { dialog, ask } = useConfirm();

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
    // Paint in your own colour, the same one others see at the reveal.
    const me = view.players.find((p) => p.id === view.you.id);
    paint.showOwn(me ? playerColour(me.colour) : null);
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
      conn.sendPaint({ cells: compactRecord(paint.layer.toRecord()), floor });
      lastSentVersion.current = paint.version.peek();
    }, 400);
    return () => {
      if (sendTimer.current) clearTimeout(sendTimer.current);
    };
  }, [version, floor, guessing]);

  function lockIn() {
    if (paint.layer.isEmpty) return;
    if (sendTimer.current) clearTimeout(sendTimer.current);
    conn.sendPaint({ cells: compactRecord(paint.layer.toRecord()), floor: paint.floor.value });
    conn.lock();
  }

  if (view.phase === "reveal" && view.reveal) {
    return <Reveal conn={conn} view={view} reveal={view.reveal} />;
  }

  const round = view.round!;
  return (
    <>
      {dialog}
      <div class="hud">
        <div class="hud-top">
          <HudHeader
            round={round.index + 1}
            total={round.total}
            right={<Countdown msRemaining={() => conn.msUntil(round.deadline)} />}
          />
          <QuestionCard q={round.question} />
          <ConnectionNote conn={conn} />
          {view.you.spectating && (
            <Card>
              <p class="hint">You joined mid-round, so you're watching this one. You'll play from the next question.</p>
            </Card>
          )}
          {view.you.locked && (
            <Card>
              <p class="hint">Locked in. The round ends when everyone has, or when the clock runs out.</p>
            </Card>
          )}
        </div>
        <div class="hud-right">
          <PlayersPanel
            view={view}
            onKick={view.you.isHost ? (p) => ask(kickRequest(p.name, () => conn.kick(p.id))) : undefined}
          />
          {view.you.isHost && (
            <EndGameButton
              onEnd={() => conn.end()}
              title="Score this round as it stands and show the final standings"
            />
          )}
        </div>
        {!view.you.spectating && (
          <PaintTools>
            <button class="danger" onClick={() => paint.clear()} disabled={!paint.enabled.value}>
              <Icon name="trash" /> Clear
            </button>
            <button
              class="primary"
              title="Whatever is painted when the clock hits zero counts anyway."
              onClick={lockIn}
              disabled={view.you.locked || paint.layer.isEmpty}
            >
              <Icon name="lock" /> {view.you.locked ? "Locked in" : "Lock in"}
            </button>
          </PaintTools>
        )}
      </div>
      <DevDrawer>
        <Card title="Players">
          <PlayerList players={view.players} you={view.you.id} showScores />
        </Card>
        <PaintDev />
        <ConnectionDev conn={conn} view={view} />
      </DevDrawer>
    </>
  );
}
