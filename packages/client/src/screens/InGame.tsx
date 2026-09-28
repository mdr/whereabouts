import { useEffect, useRef } from "preact/hooks";
import { PaintLayer, compactRecord, playerColour, type GameView } from "@whereabouts/shared";
import type { Connection } from "../net";
import { usePaint } from "../ui/MapView";
import { AnswerMode, Card, Countdown, HudHeader, QuestionCard } from "../ui/bits";
import { PaintDev, PaintTools } from "../ui/PaintTools";
import { PlayerList } from "../ui/PlayerList";
import { ConnectionNote } from "../ui/ConnectionNote";
import { DevDrawer } from "../ui/DevDrawer";
import { ConnectionDev } from "../ui/ConnectionDev";
import { Reveal } from "./Reveal";
import { loadBorders } from "../borders";
import { useFillTool } from "../fill";
import { Icon } from "../ui/icons";
import { PlayersPanel } from "../ui/PlayersPanel";
import { EndGameButton } from "../ui/HostControls";
import { kickRequest, makeHostRequest, useConfirm } from "../ui/ConfirmDialog";
import { askedToWatch, startOnPan } from "../settings";
import { TakeSeatButton } from "../ui/TakeSeat";
import { sound } from "../sound";
import { loadRegions } from "../regions";

export function InGame({ conn, view }: { conn: Connection; view: GameView }) {
  const paint = usePaint();
  // Not painting this round: a spectator, or a late joiner sitting one out.
  const sittingOut = view.you.watching || view.you.spectating;
  const roundKey = view.round?.index ?? view.reveal?.index ?? -1;
  const guessing = view.phase === "guessing";
  // The Fill tool, for a country on the Political map; on through the
  // reveal, so a run of country rounds keeps the tool chosen.
  const question = view.round?.question ?? view.reveal?.question;
  useFillTool(
    paint,
    view.config.mapDetail === "political" && (question?.regionId !== undefined || question?.flag !== undefined),
  );
  const sendTimer = useRef<number | null>(null);
  const lastSentVersion = useRef(-1);
  const { dialog, ask } = useConfirm();

  // A game with countries or flags needs the outlines at the reveal: fetch them now.
  const outlines = view.config.mix.countries + view.config.mix.flags > 0;
  useEffect(() => {
    if (outlines) loadRegions().catch((err: unknown) => console.warn("could not load countries", err));
  }, [outlines]);
  // And a game with flags, the borders its reveals name countries by.
  const flags = view.config.mix.flags > 0;
  useEffect(() => {
    if (flags) loadBorders().catch((err: unknown) => console.warn("could not load borders", err));
  }, [flags]);

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
    paint.showOwn(me && !me.watching ? playerColour(me.colour) : null);
    paint.tool.value = startOnPan.value ? "pan" : "paint";
    lastSentVersion.current = paint.version.peek();
  }, [roundKey, guessing]);

  // The host's map detail while guessing; the reveal shows everything, since
  // borders, place names, rivers and relief help make sense of the answer.
  const reveal = view.phase === "reveal";
  useEffect(() => {
    paint.gameMap.setDetail(reveal ? "reveal" : view.config.mapDetail);
  }, [reveal, view.config.mapDetail]);

  useEffect(() => {
    paint.enabled.value = guessing && !sittingOut && !view.you.locked;
  }, [guessing, sittingOut, view.you.locked]);

  // Debounced upload of the current paint while guessing.
  const version = paint.version.value;
  const floor = paint.floor.value;
  useEffect(() => {
    if (!guessing || sittingOut || view.you.locked) return;
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

  // Done with paint freezes it; Done with nothing painted is a pass, which
  // scores PASS_SCORE (250) and lets the round end without waiting on you.
  function lockIn() {
    if (sendTimer.current) clearTimeout(sendTimer.current);
    if (!paint.layer.isEmpty) {
      conn.sendPaint({ cells: compactRecord(paint.layer.toRecord()), floor: paint.floor.value });
    } else {
      sound.play("chicken");
    }
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
          <QuestionCard q={round.question}>
            {round.question.flag ? (
              <AnswerMode area={round.question.regionId !== undefined} />
            ) : (
              round.question.regionId && <p class="hint region-hint">Cover the whole country: its shape counts.</p>
            )}
          </QuestionCard>
          <ConnectionNote conn={conn} />
          {view.you.watching && (
            <Card>
              <p class="hint">
                {askedToWatch.value
                  ? "You're watching this game. You'll see each answer and everyone's guesses at the reveal."
                  : "The game was full, so you're watching. You'll see each answer and everyone's guesses at the reveal."}
              </p>
              <TakeSeatButton conn={conn} view={view} />
            </Card>
          )}
          {view.you.spectating && (
            <Card>
              <p class="hint">You joined mid-round, so you're watching this one. You'll play from the next question.</p>
            </Card>
          )}
          {view.you.locked && (
            <Card>
              <p class="hint">
                You're done. The round ends when everyone is, or when the clock runs out. Changed your mind? Keep
                editing.
              </p>
            </Card>
          )}
        </div>
        <div class="hud-right">
          <PlayersPanel
            view={view}
            onKick={view.you.isHost ? (p) => ask(kickRequest(p.name, () => conn.kick(p.id))) : undefined}
            onMakeHost={view.you.isHost ? (p) => ask(makeHostRequest(p.name, () => conn.makeHost(p.id))) : undefined}
          />
          {view.you.isHost && (
            <EndGameButton
              onEnd={() => conn.end()}
              title="Score this round as it stands and show the final standings"
            />
          )}
        </div>
        {!sittingOut && (
          <PaintTools>
            {view.you.locked ? (
              <button class="keep-editing" title="Take back Done and change your guess" onClick={() => conn.unlock()}>
                <Icon name="edit" /> Keep editing
              </button>
            ) : (
              <button
                class="primary"
                title={
                  paint.isEmpty.value
                    ? "No idea? Passing scores 250. Even painting a wide, vague area scores better on average."
                    : "Whatever is painted when the clock hits zero counts anyway."
                }
                onClick={lockIn}
              >
                <Icon name="check" /> {paint.isEmpty.value ? "Pass" : "Done"}
              </button>
            )}
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
