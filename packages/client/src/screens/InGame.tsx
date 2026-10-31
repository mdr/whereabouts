import { useEffect, useMemo, useState } from "preact/hooks"
import { colourCss } from "@whereabouts/shared/colours"
import { onWater, outlineOf, type GameView, Phase } from "@whereabouts/shared/protocol"
import { QuestionType } from "@whereabouts/shared/questions"
import { AREA_TYPES } from "@whereabouts/shared/catalogue"
import type { Connection } from "../net"
import { usePaint } from "../ui/MapView"
import { Card } from "../ui/Card"
import { Countdown, Hud, HudHeader, HudRight, HudTop, toolbarGrow } from "../ui/Hud"
import kit from "../ui/kit.module.css"
import { DoneButton, RoundPrompt } from "../ui/Round"
import { PaintDev, PaintTools } from "../ui/PaintTools"
import { PlayerList } from "../ui/PlayerList"
import { ConnectionNote } from "../ui/ConnectionNote"
import { DevDrawer } from "../ui/DevDrawer"
import { ConnectionDev } from "../ui/ConnectionDev"
import { Reveal } from "./Reveal"
import { useBorders } from "../borders"
import { Icon } from "../ui/icons"
import { PlayersPanel, playersPanelOpen } from "../ui/PlayersPanel"
import { EndGameButton } from "../ui/HostControls"
import { kickRequest, makeHostRequest, useConfirm } from "../ui/ConfirmDialog"
import { askedToWatch } from "../settings"
import { TakeSeatButton } from "../ui/TakeSeat"
import { HintCard } from "../ui/Hint"
import { useOutline, useOutlines } from "../outlines"
import { VrButton, useVrView } from "../ui/VrButton"
import { mainCountry } from "../ui/FlagReveal"
import { inGameTestIds } from "./InGameTestIds"
import { useFact } from "../facts"
import { useRoundMap } from "../round"
import { usePaintUpload } from "../paint-upload"
import { canPaint, canUnlock } from "../editing"
import { paintLayer } from "../reveal-paint"
import { RoundNote, canEndGame, roundNote } from "../round-model"
import { noteText } from "../round-words"
import { gameVrView } from "../game-vr-view"

export function InGame({ conn, view }: { conn: Connection; view: GameView }) {
  const paint = usePaint()
  const { sittingOut } = view.you
  const note = roundNote(view.you)
  const roundKey = view.round?.index ?? view.reveal?.index ?? -1
  const guessing = view.phase === Phase.GUESSING
  const question = view.round?.question ?? view.reveal?.question
  // The countdown has reached zero: painting stops, and what is on screen is what counts.
  const [timeUp, setTimeUp] = useState(false)
  const online = conn.online.value
  const { dialog, ask } = useConfirm(online)

  // Fetched as the game starts, ready for its reveals: outlines for area rounds, and the
  // borders that flag rounds name countries by.
  useOutlines(AREA_TYPES.some((t) => view.config.mix[t] > 0))
  const borders = useBorders(view.config.mix[QuestionType.FLAG] > 0)

  useRoundMap(paint, {
    round: roundKey,
    painting: guessing && view.round !== undefined,
    question,
    detail: view.config.mapDetail,
    reveal: view.phase === Phase.REVEAL,
    hint: view.you.hint,
    start: () => {
      // After a reconnect the server hands back what we had painted.
      const saved = view.you.paint
      if (saved) {
        paint.restore(saved.cells)
        paint.floor.value = saved.floor
      }
      // Paint in your own colour, the same one others see at the reveal.
      const me = view.players.find((p) => p.id === view.you.id)
      paint.showOwn(me && !me.watching ? colourCss(me.colour) : undefined)
    }
  })

  // The server scores a moment after the deadline (ROUND_GRACE), so paint sent at zero still counts.
  const deadline = view.round?.deadline
  useEffect(() => {
    setTimeUp(false)
    if (!guessing || deadline === undefined) return
    const timer = window.setTimeout(() => setTimeUp(true), Math.max(0, conn.timeUntil(deadline)))
    return () => clearTimeout(timer)
  }, [roundKey, guessing, deadline])

  const editing = canPaint(view, timeUp)
  useEffect(() => {
    paint.enabled.value = editing
  }, [editing])

  const { lockIn } = usePaintUpload(conn, paint, view, timeUp)
  const words = { askedToWatch: askedToWatch.value, canUnlock: canUnlock(view, timeUp) }

  const outline = useOutline(question && outlineOf(question.answer))

  // The room's code, so everyone in the game sees the same one.
  const fact = useFact(
    view.reveal && { place: view.reveal.place, type: view.reveal.question.type },
    view.code,
    view.reveal?.index ?? 0
  )

  const mine = view.reveal?.results.find((r) => r.playerId === view.you.id)
  const painted = useMemo(
    () =>
      view.reveal?.question.type === QuestionType.FLAG && borders && mine?.paint
        ? mainCountry(borders, paintLayer(mine.res, mine.paint).toCells())
        : undefined,
    [borders, view.reveal?.index, mine?.paint !== undefined]
  )
  const vrView = gameVrView(view, conn, paint, { lockIn, timeUp, outline, fact, painted, borders })
  useVrView(vrView)

  if (view.phase === Phase.REVEAL && view.reveal) {
    return <Reveal conn={conn} view={view} reveal={view.reveal} vrView={vrView} fact={fact} />
  }

  const round = view.round!
  return (
    <>
      {dialog}
      <Hud>
        <HudTop>
          <HudHeader
            round={round.index + 1}
            total={round.total}
            right={<Countdown timeLeft={() => conn.timeUntil(round.deadline)} />}
          />
          <RoundPrompt question={round.question} />
          {!sittingOut && view.config.hints > 0 && (
            <HintCard
              band={view.you.hint}
              left={view.you.hintsLeft}
              disabled={!online}
              onUse={(axis) => conn.hint(axis)}
            />
          )}
          <ConnectionNote conn={conn} onMap />
          {note === RoundNote.WATCHING && (
            <Card>
              <p class={kit.hint}>{noteText(note, words)}</p>
              <TakeSeatButton conn={conn} view={view} inCard />
            </Card>
          )}
          {note === RoundNote.JOINED_LATE && (
            <Card>
              <p class={kit.hint} data-testid={inGameTestIds.sittingOutNote}>
                {noteText(note, words)}
              </p>
            </Card>
          )}
          {note === RoundNote.DONE && (
            <Card>
              <p class={kit.hint} data-testid={inGameTestIds.doneNote}>
                {noteText(note, words)}
              </p>
            </Card>
          )}
        </HudTop>
        <HudRight roomy={playersPanelOpen.value}>
          <PlayersPanel
            view={view}
            onKick={view.you.isHost ? (p) => ask(kickRequest(p.name, () => conn.kick(p.id))) : undefined}
            onMakeHost={view.you.isHost ? (p) => ask(makeHostRequest(p.name, () => conn.makeHost(p.id))) : undefined}
          />
          {canEndGame(view) && (
            <EndGameButton
              onEnd={() => conn.end()}
              title="Score this round as it stands and show the final standings"
              besidePlayers
              online={online}
            />
          )}
        </HudRight>
        {!sittingOut && (
          <PaintTools water={onWater(round.question.answer)} hint={view.you.hint} canPass={!view.you.locked}>
            {view.you.locked ? (
              <button
                class={toolbarGrow}
                title={
                  canUnlock(view, timeUp) ? "Take back Done and change your guess" : "Time's up: your guess stands"
                }
                disabled={!canUnlock(view, timeUp) || !online}
                onClick={() => conn.unlock()}
                data-testid={inGameTestIds.keepEditingButton}
              >
                <Icon name="edit" /> Keep editing
              </button>
            ) : (
              <>
                <VrButton view={vrView} />
                <DoneButton
                  label="Done"
                  onDone={lockIn}
                  paintedTitle="Whatever is painted when the clock hits zero counts anyway."
                  testId={inGameTestIds.doneButton}
                />
              </>
            )}
          </PaintTools>
        )}
      </Hud>
      <DevDrawer>
        <Card title="Players">
          <PlayerList players={view.players} you={view.you.id} showScores />
        </Card>
        <PaintDev />
        <ConnectionDev conn={conn} view={view} />
      </DevDrawer>
    </>
  )
}
