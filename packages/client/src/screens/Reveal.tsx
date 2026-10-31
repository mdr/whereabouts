import { useEffect, useMemo, useState } from "preact/hooks"
import { signal } from "@preact/signals"
import type { Fact } from "@whereabouts/shared/facts"
import type { GameView, PlayerView, RevealView, RoundResultView } from "@whereabouts/shared/protocol"
import type { PaintedCountry } from "@whereabouts/shared/borders"
import type { RegionQuestion } from "@whereabouts/shared/regions"
import type { Connection } from "../net"
import { usePaint } from "../ui/MapView"
import { Card } from "../ui/Card"
import { ScoreParts } from "../ui/ScoreParts"
import { HeaderNote, Hud, HudBottom, HudHeader, HudRight, HudTop, ToolbarNote } from "../ui/Hud"
import { cx } from "../ui/cx"
import kit from "../ui/kit.module.css"
import pl from "../ui/Players.module.css"
import { RevealCards } from "../ui/Round"
import { frameReveal, showAnswer, type RevealedAnswer } from "../round"
import { ConnectionNote } from "../ui/ConnectionNote"
import { DevDrawer } from "../ui/DevDrawer"
import { ConnectionDev } from "../ui/ConnectionDev"
import { PaintDev } from "../ui/PaintTools"
import { Icon } from "../ui/icons"
import { HostTag, RankArrow, Swatch } from "../ui/PlayerList"
import { EndGameButton } from "../ui/HostControls"
import { TakeSeatButton } from "../ui/TakeSeat"
import { kickRequest, useConfirm } from "../ui/ConfirmDialog"
import { useRegion } from "../regions"
import { useBorders } from "../borders"
import { AllFlags, AllFlagsSwitch, FlagHover, mainCountry, PaintedIn } from "../ui/FlagReveal"
import { VrButton } from "../ui/VrButton"
import { allFlags } from "../settings"
import type { VrView } from "../vr/view"
import { revealTestIds } from "./RevealTestIds"
import { paintLayer, paintsOf } from "../reveal-paint"

export function revealedAnswer(reveal: RevealView, region: RegionQuestion | undefined): RevealedAnswer {
  return {
    label: reveal.label,
    wiki: reveal.wiki,
    answer: reveal.answer,
    outline: region?.outline,
    photo: reveal.photo
  }
}

/** Selection meaning "show nobody's paint", alongside undefined (everyone) and a player id. */
export const NONE = "none"

/** Whose paint the reveal shows, on the page and in the headset alike. */
export const revealShown = signal<string | undefined>(undefined)

/** The results whose paint to show, best first. */
export function shownResults(results: RoundResultView[], shown: string | undefined): RoundResultView[] {
  return shown === NONE ? [] : results.filter((r) => r.paint && (shown === undefined || r.playerId === shown))
}

/**
 * Rows for the reveal list: this round's winner first. Everyone who played,
 * passes included, comes in score order, then anyone who sat the round out;
 * ties keep the standings order. Spectators are not listed: they never play.
 */
export function revealOrder(
  players: PlayerView[],
  results: RoundResultView[]
): { p: PlayerView; r?: RoundResultView }[] {
  const group = (r?: RoundResultView) => (r ? 0 : 1)
  return players
    .filter((p) => !p.watching)
    .sort((a, b) => a.rank - b.rank)
    .map((p) => ({ p, r: results.find((x) => x.playerId === p.id) }))
    .sort((a, b) => group(a.r) - group(b.r) || (b.r?.score ?? 0) - (a.r?.score ?? 0))
}

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

  // A country round shows the country's outline, once the outlines are loaded.
  const region = useRegion(reveal.question.regionId)
  const answer = revealedAnswer(reveal, region)

  // A flag round names the country under the pointer, and where each player's paint mostly was.
  const answerFlag = reveal.question.flag
  const borders = useBorders(answerFlag !== undefined)
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
  }, [reveal.index, region])

  // Show everyone's paint in their colours (best score drawn on top), or one
  // player's, framed together with the answer.
  const show = (shown: string | undefined) =>
    paint.showColoured(paintsOf(shownResults(reveal.results, shown), view.players).flatMap((p) => p.features))
  useEffect(() => {
    frameReveal(paint.gameMap, reveal.question, answer, show(selected))
  }, [selected, reveal.index, region])
  // Not framed: the map would jump about as the mouse crosses the rows.
  useEffect(() => {
    if (hovered === undefined) return
    show(hovered)
    return () => show(selected)
  }, [hovered, selected, reveal.index])
  useEffect(() => setHovered(undefined), [reveal.index])

  const mine = reveal.results.find((r) => r.playerId === view.you.id)
  const last = reveal.index + 1 >= reveal.total
  const ready = new Set(reveal.ready)
  const present = view.players.filter((p) => p.connected && !p.watching)
  const readyCount = present.filter((p) => ready.has(p.id)).length
  const iAmReady = view.you.id !== undefined && ready.has(view.you.id)
  const rows = revealOrder(view.players, reveal.results)

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
                {readyCount} / {present.length} ready
              </HeaderNote>
            }
          />
          <RevealCards
            question={reveal.question}
            countryFlag={region?.countryFlag}
            revealed={answer}
            fact={fact}
            you={mine && { score: mine.score, passed: !mine.paint }}
            playedLabel="your score this round"
            where={mine && where.get(mine.playerId)}
            testIds={{ scoreCard: revealTestIds.scoreCard }}
          />
          <ConnectionNote conn={conn} />
        </HudTop>
        <HudRight>
          <Card title="Scores">
            <ul class={cx(pl.list, pl.pick)} data-testid={revealTestIds.scoresList}>
              <li
                class={cx(pl.everyone, selected === undefined && pl.selected)}
                onClick={() => setSelected(undefined)}
                data-testid={revealTestIds.everyoneRow}
              >
                <Swatch everyone />
                <span class={pl.name}>Everyone</span>
              </li>
              {rows.map(({ p, r }) => (
                <RevealRow
                  key={p.id}
                  p={p}
                  r={r}
                  you={p.id === view.you.id}
                  ready={ready.has(p.id)}
                  selected={p.id === selected}
                  where={where.get(p.id)}
                  answerFlag={answerFlag}
                  onSelect={() => setSelected(selected === p.id ? undefined : p.id)}
                  onHover={(on) => setHovered(on && r?.paint ? p.id : undefined)}
                  onKick={
                    view.you.isHost && p.id !== view.you.id
                      ? () => ask(kickRequest(p.name, () => conn.kick(p.id)))
                      : undefined
                  }
                />
              ))}
              <li
                class={cx(pl.hidePaint, selected === NONE && pl.selected)}
                onClick={() => setSelected(selected === NONE ? undefined : NONE)}
                data-testid={revealTestIds.hidePaintRow}
                title="Show the map and the answer without anyone's paint"
              >
                <span class={pl.swatchIcon}>
                  <Icon name="eyeOff" size={13} />
                </span>
                <span class={pl.name}>Hide paint</span>
              </li>
            </ul>
            <p class={kit.hint}>Pick a player to see just their guess.</p>
          </Card>
          {/* Where it is while guessing too, and away from Next round below. */}
          {view.you.isHost && !last && <EndGameButton onEnd={() => conn.end()} />}
        </HudRight>
        <HudBottom>
          {answerFlag && <AllFlagsSwitch />}
          <VrButton view={vrView} />
          {view.you.watching ? (
            <TakeSeatButton conn={conn} view={view} />
          ) : (
            <button
              class={iAmReady ? "" : "primary"}
              onClick={() => conn.ready()}
              disabled={iAmReady}
              data-testid={revealTestIds.readyButton}
            >
              <Icon name="check" /> Ready
            </button>
          )}
          {view.you.isHost ? (
            <button
              class={iAmReady || view.you.watching ? "primary" : ""}
              onClick={() => conn.next()}
              title="Go on without waiting"
              data-testid={revealTestIds.nextButton}
            >
              <Icon name={last ? "flag" : "next"} /> {last ? "Show final results" : "Next round"}
            </button>
          ) : (
            iAmReady && <ToolbarNote>Waiting for the others…</ToolbarNote>
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
                {r.region ? (
                  <span class={kit.parts}>
                    shape <b>{Math.round(r.region.shape)}</b> · nearness <b>{Math.round(r.region.nearness)}</b>
                  </span>
                ) : (
                  <ScoreParts A={r.A} B={r.B} />
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
          <span class={pl.hinted} title={`Used a ${r.hint} hint this round`} data-testid={revealTestIds.hintTag}>
            <Icon name="hint" size={11} />
          </span>
        )}
        {ready && (
          <span class={cx(pl.tag, pl.ready)} title="Ready for the next round">
            ✓
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
        {r ? `+${Math.round(r.score)}` : "sat out"}
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
