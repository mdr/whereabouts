import { useEffect, useMemo, useState } from "preact/hooks"
import { signal } from "@preact/signals"
import { PaintLayer } from "@whereabouts/shared/paint"
import { colourCss } from "@whereabouts/shared/colours"
import type { Fact } from "@whereabouts/shared/facts"
import type { GameView, PlayerView, RevealView, RoundResultView } from "@whereabouts/shared/protocol"
import type { PaintedCountry } from "@whereabouts/shared/borders"
import type { Connection } from "../net"
import { usePaint } from "../ui/MapView"
import { Answer, Card, FactLine, HudBottom, HudHeader, QuestionCard, ScoreParts } from "../ui/bits"
import { ConnectionNote } from "../ui/ConnectionNote"
import { DevDrawer } from "../ui/DevDrawer"
import { ConnectionDev } from "../ui/ConnectionDev"
import { PaintDev } from "../ui/PaintTools"
import { Icon } from "../ui/icons"
import { HostTag } from "../ui/PlayerList"
import { EndGameButton } from "../ui/HostControls"
import { TakeSeatButton } from "../ui/TakeSeat"
import { kickRequest, useConfirm } from "../ui/ConfirmDialog"
import { useRegion } from "../regions"
import { useBorders } from "../borders"
import { AllFlags, AllFlagsSwitch, FlagHover, mainCountry, PaintedIn } from "../ui/FlagReveal"
import { VrButton } from "../ui/VrButton"
import { allFlags } from "../settings"
import type { VrView } from "../vr"
import { revealTestIds } from "./RevealTestIds"

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
  const isCountry = reveal.question.regionId !== undefined

  // A flag round names the country under the pointer, and where each player's paint mostly was.
  const answerFlag = reveal.question.flag
  const borders = useBorders(answerFlag !== undefined)
  const where = useMemo(() => {
    const m = new Map<string, PaintedCountry | undefined>()
    if (borders)
      for (const r of reveal.results)
        if (r.paint) m.set(r.playerId, mainCountry(borders, PaintLayer.fromRecord(r.res, r.paint.cells).toCells()))
    return m
  }, [borders, reveal.index])

  useEffect(() => {
    paint.enabled.value = false
    if (!isCountry) paint.gameMap.showReveal(reveal.answer, reveal.question.toleranceKm)
    else if (region) paint.gameMap.showRegionReveal(region.outline)
    else paint.gameMap.clearReveal()
  }, [reveal.index, region])

  // Show everyone's paint in their colours (best score drawn on top), or one
  // player's, framed together with the answer.
  const layersOf = (shown: string | undefined) =>
    [...shownResults(reveal.results, shown)].reverse().flatMap((r) => {
      const p = byId.get(r.playerId)
      return p && r.paint ? [{ layer: PaintLayer.fromRecord(r.res, r.paint.cells), colour: colourCss(p.colour) }] : []
    })
  useEffect(() => {
    const fc = paint.showLayers(layersOf(selected))
    if (region) paint.gameMap.fitRegionAndPaint(reveal.answer, region.outline, fc, reveal.question.toleranceKm)
    else paint.gameMap.fitAnswerAndPaint(reveal.answer, fc, reveal.question.toleranceKm)
  }, [selected, reveal.index, region])
  // Not framed: the map would jump about as the mouse crosses the rows.
  useEffect(() => {
    if (hovered === undefined) return
    paint.showLayers(layersOf(hovered))
    return () => paint.showLayers(layersOf(selected))
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
      <div class="hud reveal">
        <div class="hud-top">
          <HudHeader
            round={reveal.index + 1}
            total={reveal.total}
            right={
              <span
                class="ready-count"
                title="The next round starts when everyone is ready"
                data-testid={revealTestIds.readyCount}
              >
                {readyCount} / {present.length} ready
              </span>
            }
          />
          <QuestionCard
            q={reveal.question}
            credit
            countryFlag={region?.countryFlag}
            photo={reveal.photo}
            foldable
            startFolded
          >
            <Answer label={reveal.label} wiki={reveal.wiki} />
            <FactLine fact={fact} />
          </QuestionCard>
          <div class="card score" data-testid={revealTestIds.scoreCard}>
            <div class="big">{mine ? Math.round(mine.score) : "—"}</div>
            <div class="label">
              {mine ? (mine.paint ? "your score this round" : "you passed this round") : "you sat this one out"}
            </div>
            {mine && where.get(mine.playerId) && (
              <div class="fit">
                Your paint: <PaintedIn where={where.get(mine.playerId)!} answer={answerFlag} whose="your" />
              </div>
            )}
          </div>
          <ConnectionNote conn={conn} />
        </div>
        <div class="hud-right">
          <Card title="Scores">
            <ul class="reveal-list" data-testid={revealTestIds.scoresList}>
              <li
                class={`everyone ${selected === undefined ? "selected" : ""}`}
                onClick={() => setSelected(undefined)}
                data-testid={revealTestIds.everyoneRow}
              >
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
                class={`hide-paint ${selected === NONE ? "selected" : ""}`}
                onClick={() => setSelected(selected === NONE ? undefined : NONE)}
                data-testid={revealTestIds.hidePaintRow}
                title="Show the map and the answer without anyone's paint"
              >
                <span class="swatch-icon">
                  <Icon name="eyeOff" size={13} />
                </span>
                <span class="name">Hide paint</span>
              </li>
            </ul>
            <p class="hint">Pick a player to see just their guess.</p>
          </Card>
          {/* Where it is while guessing too, and away from Next round below. */}
          {view.you.isHost && !last && <EndGameButton onEnd={() => conn.end()} />}
        </div>
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
                {r.region ? (
                  <span class="parts">
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
      class={`${selected ? "selected" : ""} ${you ? "you" : ""} ${where ? "with-where" : ""}`}
      onClick={onSelect}
      onPointerEnter={(e) => e.pointerType === "mouse" && onHover(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && onHover(false)}
      data-testid={revealTestIds.playerRow}
      data-player={p.name}
    >
      <span class="swatch" style={{ background: colourCss(p.colour) }} />
      <span class="name">
        <span class="name-text" data-testid={revealTestIds.playerName}>
          {p.name}
        </span>
        {p.isHost && <HostTag />}
        {r && !r.paint && (
          <span class="tag passed" title="Made no guess this round" data-testid={revealTestIds.passedTag}>
            passed
          </span>
        )}
        {r?.hint && (
          <span class="tag hinted" title={`Used a ${r.hint} hint this round`} data-testid={revealTestIds.hintTag}>
            <Icon name="hint" size={11} />
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
            e.stopPropagation()
            onKick()
          }}
        >
          <Icon name="kick" size={13} />
        </button>
      )}
      <span class="round-score" title="This round" data-testid={revealTestIds.roundScore}>
        {r ? `+${Math.round(r.score)}` : "sat out"}
      </span>
      <span class={`arrow ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
        {delta > 0 ? "▲" : delta < 0 ? "▼" : ""}
      </span>
      <span class="score-num" title="Total so far">
        {Math.round(p.score).toLocaleString()}
      </span>
      {where && (
        <span class="where">
          <PaintedIn where={where} answer={answerFlag} whose={you ? "your" : `${p.name}'s`} />
        </span>
      )}
    </li>
  )
}
