import { useEffect, useMemo, useState } from "preact/hooks"
import type { Fact } from "@whereabouts/shared/facts"
import {
  outlineOf,
  type GameView,
  type PlayerView,
  type RevealView,
  type RoundResultView
} from "@whereabouts/shared/protocol"
import type { PaintedCountry } from "@whereabouts/shared/borders"
import type { HintAxis } from "@whereabouts/shared/hints"
import { AnswerType, QuestionType, clueFlag } from "@whereabouts/shared/questions"
import type { Connection } from "../net"
import { usePaint } from "../ui/MapView"
import { Card } from "../ui/Card"
import { ScoreParts } from "../ui/ScoreParts"
import { HeaderNote, Hud, HudBottom, HudHeader, HudRight, HudTop } from "../ui/Hud"
import { cx } from "../ui/cx"
import kit from "../ui/kit.module.css"
import pl from "../ui/Players.module.css"
import { RevealCards } from "../ui/Round"
import { frameReveal, showAnswer } from "../round"
import { revealedFromView, revealShown, shownResults } from "../reveal"
import { ShownRowType, canEndGame, revealModel } from "../round-model"
import { WAITING_FOR_OTHERS, readyCountText, roundScoreText } from "../round-words"
import { ConnectionNote } from "../ui/ConnectionNote"
import { DevDrawer } from "../ui/DevDrawer"
import { ConnectionDev } from "../ui/ConnectionDev"
import { PaintDev } from "../ui/PaintTools"
import { Icon } from "../ui/icons"
import { HostTag, RankArrow, Swatch } from "../ui/PlayerList"
import { EndGameButton } from "../ui/HostControls"
import { TakeSeatButton } from "../ui/TakeSeat"
import { kickRequest, useConfirm } from "../ui/ConfirmDialog"
import { useOutline } from "../outlines"
import { useBorders } from "../borders"
import { AllFlags, AllFlagsSwitch, FlagHover, mainCountry, PaintedIn } from "../ui/FlagReveal"
import { VrButton } from "../ui/VrButton"
import { allFlags } from "../settings"
import type { VrView } from "../vr/view"
import { revealTestIds } from "./RevealTestIds"
import { paintLayer, paintsOf } from "../reveal-paint"

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
  const setSelected = (s: string | undefined) => (revealShown.value = s)
  /** A player row under the mouse: their paint alone, until the mouse moves off. */
  const [hovered, setHovered] = useState<string | undefined>(undefined)
  useEffect(
    () => () => {
      revealShown.value = undefined
    },
    []
  )
  const { dialog, ask } = useConfirm()

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
        if (r.paint) m.set(r.playerId, mainCountry(borders, paintLayer(r.res, r.paint).toCells()))
    return m
  }, [borders, reveal.index])

  useEffect(() => {
    paint.enabled.value = false
    showAnswer(paint.gameMap, reveal.question, answer)
  }, [reveal.index, outline])

  // Show everyone's paint in their colours (best score drawn on top), or one
  // player's, framed together with the answer.
  const show = (shown: string | undefined) =>
    paint.showColoured(paintsOf(shownResults(reveal.results, shown), view.players).flatMap((p) => p.features))
  useEffect(() => {
    frameReveal(paint.gameMap, reveal.question, answer, show(selected))
  }, [selected, reveal.index, outline])
  // Not framed: the map would jump about as the mouse crosses the rows.
  useEffect(() => {
    if (hovered === undefined) return
    show(hovered)
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
            you={mine && { score: mine.score, passed: !mine.paint }}
            playedLabel="your score this round"
            where={mine && where.get(mine.playerId)}
            testIds={{ scoreCard: revealTestIds.scoreCard }}
          />
          <ConnectionNote conn={conn} onMap />
        </HudTop>
        <HudRight>
          <Card title="Scores">
            <ul class={cx(pl.list, pl.pick)} data-testid={revealTestIds.scoresList}>
              {model.rows.map((row) =>
                row.type === ShownRowType.EVERYONE ? (
                  <li
                    key="everyone"
                    class={cx(pl.everyone, row.selected && pl.selected)}
                    onClick={() => setSelected(row.pick)}
                    data-testid={revealTestIds.everyoneRow}
                  >
                    <Swatch everyone />
                    <span class={pl.name}>Everyone</span>
                  </li>
                ) : row.type === ShownRowType.HIDE_PAINT ? (
                  <li
                    key="hide"
                    class={cx(pl.hidePaint, row.selected && pl.selected)}
                    onClick={() => setSelected(row.pick)}
                    data-testid={revealTestIds.hidePaintRow}
                    title="Show the map and the answer without anyone's paint"
                  >
                    <span class={pl.swatchIcon}>
                      <Icon name="eyeOff" size={13} />
                    </span>
                    <span class={pl.name}>Hide paint</span>
                  </li>
                ) : (
                  <RevealRow
                    key={row.player.id}
                    p={row.player}
                    r={row.result}
                    you={row.you}
                    ready={row.ready}
                    selected={row.selected}
                    where={where.get(row.player.id)}
                    answerFlag={answerFlag}
                    onSelect={() => setSelected(row.pick)}
                    onHover={(on) => setHovered(on && row.result?.paint ? row.player.id : undefined)}
                    onKick={
                      view.you.isHost && !row.you
                        ? () => ask(kickRequest(row.player.name, () => conn.kick(row.player.id)))
                        : undefined
                    }
                  />
                )
              )}
            </ul>
            <p class={kit.hint}>Pick a player to see just their guess.</p>
          </Card>
          {/* Where it is while guessing too, and away from Next round below. */}
          {canEndGame(view) && <EndGameButton onEnd={() => conn.end()} />}
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
              disabled={iAmReady}
              data-testid={revealTestIds.readyButton}
            >
              <Icon name="check" /> {iAmReady ? WAITING_FOR_OTHERS : "Ready"}
            </button>
          )}
          {model.next && (
            <button
              class={iAmReady || !model.ready ? "primary" : ""}
              onClick={() => conn.next()}
              title="Go on without waiting"
              data-testid={revealTestIds.nextButton}
            >
              <Icon name={model.last ? "flag" : "next"} /> {model.next.label}
            </button>
          )}
        </HudBottom>
      </Hud>
      <DevDrawer>
        <Card title="Round results">
          <ul class={kit.results}>
            {reveal.results.map((r) => (
              <li key={r.playerId}>
                <span>
                  {byId.get(r.playerId)?.name ?? "?"}
                  {byId.get(r.playerId)?.isHost && <HostTag />}
                </span>
                {r.parts.type === AnswerType.AREA ? (
                  <span class={kit.parts}>
                    shape <b>{Math.round(r.parts.shape)}</b> · nearness <b>{Math.round(r.parts.nearness)}</b>
                  </span>
                ) : (
                  <ScoreParts A={r.parts.A} B={r.parts.B} />
                )}
              </li>
            ))}
          </ul>
        </Card>
        <PaintDev />
        <ConnectionDev conn={conn} view={view} />
      </DevDrawer>
    </>
  )
}

const hintedText = (axis: HintAxis) => `Used a ${axis.toLowerCase()} hint this round`

function RevealRow({
  p,
  r,
  you,
  ready,
  selected,
  where,
  answerFlag,
  onSelect,
  onHover,
  onKick
}: {
  p: PlayerView
  r?: RoundResultView
  you: boolean
  ready: boolean
  selected: boolean
  /** A flag round: the country most of their paint was in. */
  where: PaintedCountry | undefined
  answerFlag?: string
  onSelect: () => void
  /** The mouse coming onto the row or leaving it. Not a touch, which would leave it on. */
  onHover: (on: boolean) => void
  /** Host only: remove this player. */
  onKick?: () => void
}) {
  const delta = p.previousRank !== undefined ? p.previousRank - p.rank : 0
  return (
    <li
      class={cx(selected && pl.selected, you && pl.you, where && pl.withWhere)}
      onClick={onSelect}
      onPointerEnter={(e) => e.pointerType === "mouse" && onHover(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && onHover(false)}
      data-testid={revealTestIds.playerRow}
      data-player={p.name}
    >
      <Swatch colour={p.colour} />
      <span class={pl.name}>
        <span class={pl.nameText} data-testid={revealTestIds.playerName}>
          {p.name}
        </span>
        {p.isHost && <HostTag />}
        {r && !r.paint && (
          <span class={pl.tag} title="Made no guess this round" data-testid={revealTestIds.passedTag}>
            passed
          </span>
        )}
        {r?.hint && (
          <span class={pl.hinted} title={hintedText(r.hint)} data-testid={revealTestIds.hintTag}>
            <Icon name="hint" size={11} />
            <span class="sr-only">{hintedText(r.hint)}</span>
          </span>
        )}
        {ready && (
          <span class={cx(pl.tag, pl.ready)} title="Ready for the next round">
            <span aria-hidden="true">✓</span>
            <span class="sr-only">ready</span>
          </span>
        )}
      </span>
      {onKick && (
        <button
          class={cx("icon", pl.kick)}
          title={`Remove ${p.name} from the game`}
          aria-label={`Remove ${p.name} from the game`}
          onClick={(e) => {
            e.stopPropagation()
            onKick()
          }}
        >
          <Icon name="kick" size={13} />
        </button>
      )}
      <span class={pl.roundScore} title="This round" data-testid={revealTestIds.roundScore}>
        {roundScoreText(r)}
      </span>
      <RankArrow delta={delta} />
      <span class={pl.scoreNum} title="Total so far">
        {Math.round(p.score).toLocaleString()}
      </span>
      {where && (
        <span class={pl.where}>
          <PaintedIn where={where} answer={answerFlag} whose={you ? "your" : `${p.name}'s`} />
        </span>
      )}
    </li>
  )
}
