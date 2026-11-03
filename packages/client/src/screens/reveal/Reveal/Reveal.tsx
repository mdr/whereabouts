import type { PlayerId } from "@whereabouts/shared/ids"
import { useEffect, useMemo, useState } from "preact/hooks"
import type { Fact } from "@whereabouts/shared/catalogue/facts"
import { outlineOf, RoundGuessType, type GameView, type RevealView } from "@whereabouts/shared/protocol/views"
import type { PaintedCountry } from "@whereabouts/shared/borders"
import { QuestionType, clueFlag } from "@whereabouts/shared/questions"
import { useGameService } from "../../../game-service/use-game-service"
import { usePaint } from "../../../ui/map/MapView/MapView"
import { HeaderNote, Hud, HudBottom, HudHeader, HudRight, HudTop } from "../../../ui/map/Hud/Hud"
import { RevealCards } from "../../../ui/round/RevealCards"
import { frameReveal, showAnswer } from "../../../round/round"
import { questionCardHeight } from "../../../ui/round/question/QuestionCard/question-card-height"
import {
  SHOW_EVERYONE,
  paintFocus,
  revealedFromView,
  revealShown,
  shownResults,
  type RevealShown
} from "../../../round/reveal"
import { canEndGame, revealModel } from "../../../round/round-model"
import { WAITING_FOR_OTHERS, readyCountText } from "../../../round/round-words"
import { ConnectionNote } from "../../../ui/connection/ConnectionNote/ConnectionNote"
import { DevDrawer } from "../../../ui/dev/DevDrawer/DevDrawer"
import { ConnectionDev } from "../../../ui/connection/ConnectionDev"
import { PaintDev } from "../../../ui/map/paint/PaintDev/PaintDev"
import { Icon } from "../../../ui/icons"
import { EndGameButton } from "../../../ui/players/HostControls/HostControls"
import { TakeSeatButton } from "../../../ui/players/TakeSeat/TakeSeat"
import { kickRequest } from "../../../ui/ConfirmDialog/confirm-requests"
import { useConfirm } from "../../../ui/ConfirmDialog/ConfirmDialog"
import { useOutlines } from "../../../data/outlines"
import { useBorders } from "../../../data/borders"
import { AllFlags } from "../../../ui/round/flag-reveal/AllFlags/AllFlags"
import { AllFlagsSwitch } from "../../../ui/round/flag-reveal/AllFlagsSwitch/AllFlagsSwitch"
import { FlagHover } from "../../../ui/round/flag-reveal/FlagHover/FlagHover"
import { mainCountry } from "../../../ui/round/flag-reveal/main-country"
import { VrButton } from "../../../ui/VrButton/VrButton"
import { allFlags } from "../../../settings/settings"
import type { VrView } from "../../../vr/view/view"
import { RevealScores } from "../RevealScores/RevealScores"
import { RoundResultsDev } from "../RoundResultsDev"
import { revealTestIds } from "./RevealTestIds"
import { paintLayer, paintsOf } from "../../../round/reveal-paint"

export const Reveal = ({
  view,
  reveal,
  vrView,
  fact
}: {
  view: GameView
  reveal: RevealView
  vrView: VrView
  fact: Fact | undefined
}) => {
  const game = useGameService()
  const paint = usePaint()
  const selected = revealShown.value
  const setSelected = (shown: RevealShown) => (revealShown.value = shown)
  /** A player row under the mouse: their paint alone, until the mouse moves off. */
  const [hovered, setHovered] = useState<PlayerId | undefined>(undefined)
  useEffect(
    () => () => {
      revealShown.value = SHOW_EVERYONE
    },
    []
  )
  const { dialog, ask } = useConfirm()

  // An area round shows its outline, once the outlines are loaded.
  const outlines = useOutlines(outlineOf(reveal.question.answer) !== undefined)
  const answer = revealedFromView(reveal, outlines)

  // A flag round names the country under the pointer, and where each player's paint mostly was.
  const answerFlag = clueFlag(reveal.question.clue)
  const borders = useBorders(reveal.question.type === QuestionType.FLAG)
  const where = useMemo(() => {
    const countries = new Map<PlayerId, PaintedCountry | undefined>()
    if (borders)
      for (const result of reveal.results)
        if (result.guess.type === RoundGuessType.PAINTED)
          countries.set(
            result.playerId,
            mainCountry(borders, paintLayer(result.guess.resolution, result.guess.paint).toCells())
          )
    return countries
  }, [borders, reveal.index])

  useEffect(() => {
    paint.enabled.value = false
    showAnswer(paint.gameMap, answer)
  }, [reveal.index, outlines])

  // Everyone's paint goes on the map once, in their colours (best score drawn
  // on top); choosing or hovering a player only restyles it, which is instant.
  useEffect(() => {
    paint.showColoured(paintsOf(reveal.results).flatMap((painted) => painted.features))
  }, [reveal.index, reveal.results])
  useEffect(() => {
    paint.gameMap.setPaintFocus(paintFocus(selected, hovered))
  }, [selected, hovered, reveal.index, reveal.results])
  // Framed on what is chosen; not on hover, or the map would jump about as the mouse crosses the rows.
  useEffect(() => {
    const shown = paintsOf(shownResults(reveal.results, selected)).flatMap((painted) => painted.features)
    frameReveal(paint.gameMap.camera, reveal.question, answer, { type: "FeatureCollection", features: shown })
  }, [selected, reveal.index, outlines, questionCardHeight.value])
  useEffect(() => setHovered(undefined), [reveal.index])

  const mine = reveal.results.find((result) => result.playerId === view.you.id)
  const model = revealModel(view, reveal, selected)
  const iAmReady = model.ready?.done ?? false

  return (
    <>
      {dialog}
      {borders && <FlagHover gameMap={paint.gameMap} borders={borders} />}
      {borders && allFlags.value && <AllFlags gameMap={paint.gameMap} borders={borders} />}
      <Hud reveal>
        <HudTop>
          <HudHeader
            round={reveal.index + 1}
            total={reveal.total}
            right={
              <HeaderNote title="The next round starts when everyone is ready" testId={revealTestIds.readyCount}>
                {readyCountText(model.readyCount, model.presentCount)}
              </HeaderNote>
            }
          />
          <RevealCards
            question={reveal.question}
            revealed={answer}
            fact={fact}
            you={mine && { score: mine.score, passed: mine.guess.type === RoundGuessType.PASSED }}
            playedLabel="your score this round"
            where={mine && where.get(mine.playerId)}
            testIds={{ scoreCard: revealTestIds.scoreCard }}
          />
          <ConnectionNote onMap />
        </HudTop>
        <HudRight>
          <RevealScores
            model={model}
            where={where}
            answerFlag={answerFlag}
            onSelect={setSelected}
            onHover={setHovered}
            onKick={view.you.isHost ? (player) => ask(kickRequest(player.name, () => game.kick(player.id))) : undefined}
          />
          {/* Where it is while guessing too, and away from Next round below. */}
          {canEndGame(view) && <EndGameButton onEnd={() => game.end()} />}
        </HudRight>
        <HudBottom>
          {answerFlag && <AllFlagsSwitch />}
          <VrButton view={vrView} />
          {!model.ready ? (
            <TakeSeatButton view={view} />
          ) : (
            <button
              class={iAmReady ? "" : "primary"}
              onClick={() => game.ready()}
              disabled={iAmReady || !game.online.value}
              data-testid={revealTestIds.readyButton}
            >
              <Icon name="check" /> {iAmReady ? WAITING_FOR_OTHERS : "Ready"}
            </button>
          )}
          {model.next && (
            <button
              class={iAmReady || !model.ready ? "primary" : ""}
              onClick={() => game.next()}
              disabled={!game.online.value}
              title="Go on without waiting"
              data-testid={revealTestIds.nextButton}
            >
              <Icon name={model.last ? "flag" : "next"} /> {model.next.label}
            </button>
          )}
        </HudBottom>
      </Hud>
      <DevDrawer>
        <RoundResultsDev results={reveal.results} host={view.players.find((player) => player.isHost)?.id} />
        <PaintDev />
        <ConnectionDev view={view} />
      </DevDrawer>
    </>
  )
}
