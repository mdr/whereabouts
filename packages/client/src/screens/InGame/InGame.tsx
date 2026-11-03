import { useEffect, useMemo, useState } from "preact/hooks"
import { onWater, outlineOf, type InPlayGameView, Phase, RoundGuessType } from "@whereabouts/shared/protocol/views"
import { QuestionType } from "@whereabouts/shared/questions"
import { YouRoleType, everyone } from "@whereabouts/shared/roles"
import { useGameService } from "../../game-service/use-game-service"
import { usePaint } from "../../ui/map/MapView/MapView"
import { Card } from "../../ui/Card/Card"
import { Hud, HudHeader, HudRight, HudTop, toolbarGrow } from "../../ui/map/Hud/Hud"
import { Countdown } from "../../ui/map/Countdown/Countdown"
import kit from "../../ui/kit.module.css"
import { DoneButton } from "../../ui/round/DoneButton"
import { RoundPrompt } from "../../ui/round/RoundPrompt/RoundPrompt"
import { PaintDev } from "../../ui/map/paint/PaintDev/PaintDev"
import { PaintTools } from "../../ui/map/paint/PaintTools/PaintTools"
import { PlayerList } from "../../ui/players/PlayerList/PlayerList"
import { ConnectionNote } from "../../ui/connection/ConnectionNote/ConnectionNote"
import { DevDrawer } from "../../ui/dev/DevDrawer/DevDrawer"
import { ExtraPlayersDev } from "../../ui/dev/ExtraPlayersDev/ExtraPlayersDev"
import { ConnectionDev } from "../../ui/connection/ConnectionDev"
import { Reveal } from "../reveal/Reveal/Reveal"
import { Icon } from "../../ui/icons"
import { PlayersPanel, playersPanelOpen } from "../../ui/players/PlayersPanel/PlayersPanel"
import { EndGameButton } from "../../ui/players/HostControls/HostControls"
import { kickRequest, makeHostRequest } from "../../ui/ConfirmDialog/confirm-requests"
import { useConfirm } from "../../ui/ConfirmDialog/ConfirmDialog"
import { askedToWatch } from "../../settings/settings"
import { TakeSeatButton } from "../../ui/players/TakeSeat/TakeSeat"
import { HintCard } from "../../ui/round/Hint/Hint"
import { useOutlines } from "../../data/outlines"
import { useGameData } from "../../data/game-data"
import { VrButton, useVrView } from "../../ui/VrButton/VrButton"
import { mainCountry } from "../../ui/round/flag-reveal/main-country"
import { inGameTestIds } from "./InGameTestIds"
import { useFact } from "../../data/facts"
import { useRoundMap } from "../../round/round"
import { usePaintUpload } from "../../paint/paint-upload"
import { canPaint, canUnlock } from "../../round/editing"
import { paintLayer } from "../../round/reveal-paint"
import { RoundNote, canEndGame, ownColour, roundNote, roundOf } from "../../round/round-model"
import { noteText } from "../../round/round-words"
import { gameVrView } from "../../vr/view/game-vr-view"

export const InGame = ({ view }: { view: InPlayGameView }) => {
  const game = useGameService()
  const paint = usePaint()
  const { role } = view.you
  const note = roundNote(view.you)
  const roundKey = roundOf(view).index
  const guessing = view.phase === Phase.GUESSING
  const question = roundOf(view).question
  // The countdown has reached zero: painting stops, and what is on screen is what counts.
  const [timeUp, setTimeUp] = useState(false)
  const { dialog, ask } = useConfirm()

  const reveal = view.phase === Phase.REVEAL ? view.reveal : undefined
  const borders = useGameData(view.config.mix)

  useRoundMap(paint, {
    round: roundKey,
    painting: guessing,
    question,
    detail: view.config.mapDetail,
    reveal: view.phase === Phase.REVEAL,
    hint: view.you.hint,
    start: () => {
      // After a reconnect the server hands back what we had painted.
      const saved = view.phase === Phase.GUESSING ? view.you.paint : undefined
      if (saved) {
        paint.restore(saved.cells)
        paint.floor.value = saved.floor
      }
      // Paint in your own colour, the same one others see at the reveal.
      paint.showOwn(ownColour(view.you))
    }
  })

  // The server scores a moment after the deadline (ROUND_GRACE), so paint sent at zero still counts.
  const deadline = view.phase === Phase.GUESSING ? view.round.deadline : undefined
  useEffect(() => {
    setTimeUp(false)
    if (!guessing || deadline === undefined) return
    const timer = window.setTimeout(() => setTimeUp(true), Math.max(0, game.timeUntil(deadline)))
    return () => clearTimeout(timer)
  }, [roundKey, guessing, deadline])

  const editing = canPaint(view, timeUp)
  useEffect(() => {
    paint.enabled.value = editing
  }, [editing])

  const { lockIn } = usePaintUpload(game, paint, view, timeUp)
  const words = { askedToWatch: askedToWatch.value, canUnlock: canUnlock(view, timeUp) }

  const outlines = useOutlines(outlineOf(question.answer) !== undefined)

  // The room's code, so everyone in the game sees the same one.
  const fact = useFact(reveal && { place: reveal.place, type: reveal.question.type }, view.code, reveal?.index ?? 0)

  const mine = reveal?.results.find((result) => result.playerId === view.you.id)
  const painted = useMemo(
    () =>
      reveal?.question.type === QuestionType.FLAG && borders && mine?.guess.type === RoundGuessType.PAINTED
        ? mainCountry(borders, paintLayer(mine.guess.resolution, mine.guess.paint).toCells())
        : undefined,
    [borders, reveal?.index, mine?.guess.type]
  )
  const vrView = gameVrView(view, game, paint, { lockIn, timeUp, outlines, fact, painted, borders })
  useVrView(vrView)

  if (view.phase === Phase.REVEAL) {
    return <Reveal view={view} reveal={view.reveal} vrView={vrView} fact={fact} />
  }

  const { round } = view
  return (
    <>
      {dialog}
      <Hud>
        <HudTop>
          <HudHeader
            round={round.index + 1}
            total={round.total}
            right={deadline === undefined ? undefined : <Countdown timeLeft={() => game.timeUntil(deadline)} />}
          />
          <RoundPrompt question={round.question} />
          {role.type === YouRoleType.PLAYING && view.config.hints !== 0 && (
            <HintCard
              band={view.you.hint}
              left={role.hintsLeft}
              disabled={!game.online.value}
              onUse={(axis) => game.hint(axis)}
            />
          )}
          <ConnectionNote onMap />
          {note === RoundNote.WATCHING && (
            <Card>
              <p class={kit.hint}>{noteText(note, words)}</p>
              <TakeSeatButton view={view} inCard />
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
            onKick={view.you.isHost ? (player) => ask(kickRequest(player.name, () => game.kick(player.id))) : undefined}
            onMakeHost={
              view.you.isHost
                ? (player) => ask(makeHostRequest(player.name, () => game.makeHost(player.id)))
                : undefined
            }
          />
          {canEndGame(view) && (
            <EndGameButton
              onEnd={() => game.end()}
              title="Score this round as it stands and show the final standings"
              besidePlayers
            />
          )}
        </HudRight>
        {role.type === YouRoleType.PLAYING && (
          <PaintTools water={onWater(round.question.answer)} hint={view.you.hint} canPass={!role.locked}>
            {role.locked ? (
              <button
                class={toolbarGrow}
                title={
                  canUnlock(view, timeUp) ? "Take back Done and change your guess" : "Time's up: your guess stands"
                }
                disabled={!canUnlock(view, timeUp) || !game.online.value}
                onClick={() => game.unlock()}
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
          <PlayerList players={everyone(view)} you={view.you.id} showScores />
        </Card>
        <ExtraPlayersDev code={view.code} phase={view.phase} />
        <PaintDev />
        <ConnectionDev view={view} />
      </DevDrawer>
    </>
  )
}
