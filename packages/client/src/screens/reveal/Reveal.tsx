import type { PlayerId } from "@whereabouts/shared/ids"
import { useEffect, useMemo, useState } from "preact/hooks"
import type { Fact } from "@whereabouts/shared/catalogue/facts"
import { outlineOf, RoundGuessType, type GameView, type RevealView } from "@whereabouts/shared/protocol"
import type { PaintedCountry } from "@whereabouts/shared/borders"
import { QuestionType, clueFlag } from "@whereabouts/shared/questions"
import type { Connection } from "../../net/net"
import { usePaint } from "../../ui/map/MapView"
import { HeaderNote, Hud, HudBottom, HudHeader, HudRight, HudTop } from "../../ui/map/Hud"
import { RevealCards } from "../../ui/round/RevealCards"
import { frameReveal, showAnswer } from "../../round/round"
import { SHOW_EVERYONE, revealedFromView, revealShown, showPlayer, shownResults, type RevealShown } from "../../round/reveal"
import { canEndGame, revealModel } from "../../round/round-model"
import { WAITING_FOR_OTHERS, readyCountText } from "../../round/round-words"
import { ConnectionNote } from "../../ui/connection/ConnectionNote"
import { DevDrawer } from "../../ui/dev/DevDrawer"
import { ConnectionDev } from "../../ui/connection/ConnectionDev"
import { PaintDev } from "../../ui/map/paint/PaintDev"
import { Icon } from "../../ui/icons"
import { EndGameButton } from "../../ui/players/HostControls"
import { TakeSeatButton } from "../../ui/players/TakeSeat"
import { kickRequest, useConfirm } from "../../ui/ConfirmDialog"
import { useOutline } from "../../data/outlines"
import { useBorders } from "../../data/borders"
import { AllFlags } from "../../ui/round/flag-reveal/AllFlags"
import { AllFlagsSwitch } from "../../ui/round/flag-reveal/AllFlagsSwitch"
import { FlagHover } from "../../ui/round/flag-reveal/FlagHover"
import { mainCountry } from "../../ui/round/flag-reveal/main-country"
import { VrButton } from "../../ui/VrButton"
import { allFlags } from "../../settings/settings"
import type { VrView } from "../../vr/view/view"
import { RevealScores } from "./RevealScores"
import { RoundResultsDev } from "./RoundResultsDev"
import { revealTestIds } from "./RevealTestIds"
import { paintLayer, paintsOf } from "../../round/reveal-paint"

export function Reveal({
  conn,
  view,
  reveal,
  vrView,
  fact
}: {
  conn: Connection
  view: GameView
  reveal: RevealView
  vrView: VrView
  fact: Fact | undefined
}) {
  const paint = usePaint()
  const byId = new Map(view.players.map((p) => [p.id, p]))
  const selected = revealShown.value
  const setSelected = (s: RevealShown) => (revealShown.value = s)
  /** A player row under the mouse: their paint alone, until the mouse moves off. */
  const [hovered, setHovered] = useState<PlayerId | undefined>(undefined)
  useEffect(
    () => () => {
      revealShown.value = SHOW_EVERYONE
    },
    []
  )
  const online = conn.online.value
  const { dialog, ask } = useConfirm(online)

  // An area round shows its outline, once the outlines are loaded.
  const outline = useOutline(outlineOf(reveal.question.answer))
  const answer = revealedFromView(reveal, outline)

  // A flag round names the country under the pointer, and where each player's paint mostly was.
  const answerFlag = clueFlag(reveal.question.clue)
  const borders = useBorders(reveal.question.type === QuestionType.FLAG)
  const where = useMemo(() => {
    const m = new Map<string, PaintedCountry | undefined>()
    if (borders)
      for (const r of reveal.results)
        if (r.guess.type === RoundGuessType.PAINTED)
          m.set(r.playerId, mainCountry(borders, paintLayer(r.guess.res, r.guess.paint).toCells()))
    return m
  }, [borders, reveal.index])

  useEffect(() => {
    paint.enabled.value = false
    showAnswer(paint.gameMap, answer)
  }, [reveal.index, outline])

  // Show everyone's paint in their colours (best score drawn on top), or one
  // player's, framed together with the answer.
  const show = (shown: RevealShown) =>
    paint.showColoured(paintsOf(shownResults(reveal.results, shown), view.players).flatMap((p) => p.features))
  useEffect(() => {
    frameReveal(paint.gameMap, reveal.question, answer, show(selected))
  }, [selected, reveal.index, outline])
  // Not framed: the map would jump about as the mouse crosses the rows.
  useEffect(() => {
    if (hovered === undefined) return
    show(showPlayer(hovered))
    return () => show(selected)
  }, [hovered, selected, reveal.index])
  useEffect(() => setHovered(undefined), [reveal.index])

  const mine = reveal.results.find((r) => r.playerId === view.you.id)
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
          <ConnectionNote conn={conn} onMap />
        </HudTop>
        <HudRight>
          <RevealScores
            model={model}
            where={where}
            answerFlag={answerFlag}
            onSelect={setSelected}
            onHover={setHovered}
            onKick={view.you.isHost ? (p) => ask(kickRequest(p.name, () => conn.kick(p.id))) : undefined}
          />
          {/* Where it is while guessing too, and away from Next round below. */}
          {canEndGame(view) && <EndGameButton onEnd={() => conn.end()} online={online} />}
        </HudRight>
        <HudBottom>
          {answerFlag && <AllFlagsSwitch />}
          <VrButton view={vrView} />
          {!model.ready ? (
            <TakeSeatButton conn={conn} view={view} />
          ) : (
            <button
              class={iAmReady ? "" : "primary"}
              onClick={() => conn.ready()}
              disabled={iAmReady || !online}
              data-testid={revealTestIds.readyButton}
            >
              <Icon name="check" /> {iAmReady ? WAITING_FOR_OTHERS : "Ready"}
            </button>
          )}
          {model.next && (
            <button
              class={iAmReady || !model.ready ? "primary" : ""}
              onClick={() => conn.next()}
              disabled={!online}
              title="Go on without waiting"
              data-testid={revealTestIds.nextButton}
            >
              <Icon name={model.last ? "flag" : "next"} /> {model.next.label}
            </button>
          )}
        </HudBottom>
      </Hud>
      <DevDrawer>
        <RoundResultsDev results={reveal.results} byId={byId} />
        <PaintDev />
        <ConnectionDev conn={conn} view={view} />
      </DevDrawer>
    </>
  )
}
