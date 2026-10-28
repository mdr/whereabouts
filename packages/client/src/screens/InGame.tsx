import { useEffect, useRef, useState } from "preact/hooks"
import {
  PaintLayer,
  compactRecord,
  colourCss,
  type Fact,
  type GameView,
  type HintAxis,
  type RegionQuestion
} from "@whereabouts/shared"
import type { Connection } from "../net"
import { usePaint } from "../ui/MapView"
import { AnswerMode, Card, Countdown, HudHeader, QuestionCard, RegionHint, answerModeText } from "../ui/bits"
import { hostActions, pickable, takeSeat, vrPicked } from "../vr-actions"
import { navigate } from "../router"
import { PaintDev, PaintTools } from "../ui/PaintTools"
import { PlayerList } from "../ui/PlayerList"
import { ConnectionNote, connectionText } from "../ui/ConnectionNote"
import { DevDrawer } from "../ui/DevDrawer"
import { ConnectionDev } from "../ui/ConnectionDev"
import { NONE, Reveal, revealShown, shownResults } from "./Reveal"
import { borders, loadBorders, vrFlagPins } from "../borders"
import { useFillTool } from "../fill"
import { Icon } from "../ui/icons"
import { PlayersPanel } from "../ui/PlayersPanel"
import { EndGameButton } from "../ui/HostControls"
import { kickRequest, makeHostRequest, useConfirm } from "../ui/ConfirmDialog"
import { allFlags, askedToWatch, startOnPan } from "../settings"
import { TakeSeatButton } from "../ui/TakeSeat"
import { HintCard } from "../ui/Hint"
import { sound } from "../sound"
import { loadRegions, useRegion } from "../regions"
import { VrButton, useVrView } from "../ui/VrButton"
import type { VrView } from "../vr"
import type { PaintController } from "../paint-controller"
import { revealOrder } from "./Reveal"
import { inGameTestIds } from "./InGameTestIds"
import { useFact } from "../facts"
import { vrPicture } from "../vr-picture"

export function InGame({ conn, view }: { conn: Connection; view: GameView }) {
  const paint = usePaint()
  // Not painting this round: a spectator, or a late joiner sitting one out.
  const sittingOut = view.you.watching || view.you.spectating
  const roundKey = view.round?.index ?? view.reveal?.index ?? -1
  const guessing = view.phase === "guessing"
  // The Fill tool, for a country on the Political map; on through the
  // reveal, so a run of country rounds keeps the tool chosen.
  const question = view.round?.question ?? view.reveal?.question
  useFillTool(
    paint,
    view.config.mapDetail === "political" &&
      question?.topic === undefined &&
      (question?.regionId !== undefined || question?.flag !== undefined)
  )
  const sendTimer = useRef<number | undefined>(undefined)
  const lastSentVersion = useRef(-1)
  // The countdown has reached zero: painting stops, and what is on screen is what counts.
  const [timeUp, setTimeUp] = useState(false)
  const { dialog, ask } = useConfirm()

  // A game with outlines to show at the reveal: fetch them now.
  const { countries, flags: flagRounds, features, states } = view.config.mix
  const outlines = countries + flagRounds + features + states > 0
  useEffect(() => {
    if (outlines) loadRegions().catch((err: unknown) => console.warn("could not load countries", err))
  }, [outlines])
  // And a game with flags, the borders its reveals name countries by.
  const flags = flagRounds > 0
  useEffect(() => {
    if (flags) loadBorders().catch((err: unknown) => console.warn("could not load borders", err))
  }, [flags])

  // New round: fresh layer, painting on unless spectating. After a reconnect
  // the server hands back what we had painted, so restore it.
  useEffect(() => {
    if (!guessing || !view.round) return
    paint.reset(view.round.question.toleranceKm)
    const saved = view.you.paint
    if (saved) {
      paint.layer = PaintLayer.fromRecord(paint.layer.res, saved.cells)
      paint.floor.value = saved.floor
      paint.version.value++
    }
    paint.gameMap.clearReveal()
    paint.gameMap.resetView()
    // Paint in your own colour, the same one others see at the reveal.
    const me = view.players.find((p) => p.id === view.you.id)
    paint.showOwn(me && !me.watching ? colourCss(me.colour) : undefined)
    paint.tool.value = startOnPan.value ? "pan" : "paint"
    lastSentVersion.current = paint.version.peek()
  }, [roundKey, guessing])

  // The host's map detail while guessing; the reveal shows everything, since
  // borders, place names, rivers and relief help make sense of the answer.
  const reveal = view.phase === "reveal"
  const stateRound = question?.topic === "state"
  useEffect(() => {
    paint.gameMap.setDetail(reveal ? "reveal" : view.config.mapDetail)
    paint.gameMap.setStateReveal(reveal && stateRound)
  }, [reveal, view.config.mapDetail, stateRound])

  // The server scores a moment after the deadline (ROUND_GRACE_MS), so paint sent at zero still counts.
  const deadline = view.round?.deadline
  useEffect(() => {
    setTimeUp(false)
    if (!guessing || deadline === undefined) return
    const timer = window.setTimeout(() => setTimeUp(true), Math.max(0, conn.msUntil(deadline)))
    return () => clearTimeout(timer)
  }, [roundKey, guessing, deadline])

  useEffect(() => {
    paint.enabled.value = guessing && !sittingOut && !view.you.locked && !timeUp
  }, [guessing, sittingOut, view.you.locked, timeUp])

  /** Upload the paint now. An empty map is sent too: it takes back paint sent earlier. */
  function sendNow() {
    if (sendTimer.current) clearTimeout(sendTimer.current)
    sendTimer.current = undefined
    conn.sendPaint({ cells: compactRecord(paint.layer.toRecord()), floor: paint.floor.peek() })
    lastSentVersion.current = paint.version.peek()
  }

  // Debounced upload of the current paint while guessing.
  const version = paint.version.value
  const floor = paint.floor.value
  useEffect(() => {
    if (!guessing || sittingOut || view.you.locked || timeUp) return
    if (sendTimer.current) clearTimeout(sendTimer.current)
    sendTimer.current = window.setTimeout(sendNow, 400)
    return () => {
      if (sendTimer.current) clearTimeout(sendTimer.current)
    }
  }, [version, floor, guessing])

  useEffect(() => {
    if (timeUp && guessing && !sittingOut && !view.you.locked) sendNow()
  }, [timeUp])

  // Done with paint freezes it; Done with nothing painted is a pass, which
  // scores PASS_SCORE (250) and lets the round end without waiting on you.
  function lockIn() {
    if (paint.layer.isEmpty) sound.play("chicken")
    sendNow()
    conn.lock()
  }

  // Our hint's band, shaded on the map from when it is used until the next round.
  const hint = view.you.hint
  useEffect(() => {
    paint.gameMap.setHint(hint)
    return () => paint.gameMap.setHint(undefined)
  }, [hint?.axis, hint?.from, hint?.to])

  // A country round shows the country's flag beside its name, once the outlines have loaded.
  const region = useRegion(question?.regionId)

  // The room's code, so everyone in the game sees the same one.
  const fact = useFact(view.reveal?.wiki, view.code, view.reveal?.index ?? 0)

  const vrView = gameVrView(view, conn, paint, { lockIn, timeUp, sittingOut, region, fact })
  useVrView(vrView, `${view.phase} ${roundKey}`)

  if (view.phase === "reveal" && view.reveal) {
    return <Reveal conn={conn} view={view} reveal={view.reveal} vrView={vrView} fact={fact} />
  }

  const round = view.round!
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
          <QuestionCard q={round.question} countryFlag={region?.countryFlag}>
            {round.question.flag ? (
              <AnswerMode area={round.question.regionId !== undefined} />
            ) : (
              round.question.regionId && <RegionHint topic={round.question.topic} />
            )}
          </QuestionCard>
          {!sittingOut && view.config.hints > 0 && (
            <HintCard band={view.you.hint} left={view.you.hintsLeft} onUse={(axis) => conn.hint(axis)} />
          )}
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
              <p class="hint" data-testid={inGameTestIds.sittingOutNote}>
                You joined mid-round, so you're watching this one. You'll play from the next question.
              </p>
            </Card>
          )}
          {view.you.locked && (
            <Card>
              <p class="hint" data-testid={inGameTestIds.doneNote}>
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
          <PaintTools water={round.question.topic === "lake" || round.question.topic === "sea"} hint={view.you.hint}>
            {view.you.locked ? (
              <button
                class="keep-editing"
                title="Take back Done and change your guess"
                onClick={() => conn.unlock()}
                data-testid={inGameTestIds.keepEditingButton}
              >
                <Icon name="edit" /> Keep editing
              </button>
            ) : (
              <>
                <VrButton view={vrView} />
                <button
                  class="primary"
                  data-testid={inGameTestIds.doneButton}
                  title={
                    paint.isEmpty.value
                      ? "No idea? Passing scores 250. Even painting a wide, vague area scores better on average."
                      : "Whatever is painted when the clock hits zero counts anyway."
                  }
                  onClick={lockIn}
                >
                  <Icon name="check" /> {paint.isEmpty.value ? "Pass" : "Done"}
                </button>
              </>
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
  )
}

/** The round or its reveal as the headset shows it. */
function gameVrView(
  view: GameView,
  conn: Connection,
  paint: PaintController,
  {
    lockIn,
    timeUp,
    sittingOut,
    region,
    fact
  }: {
    lockIn: () => void
    timeUp: boolean
    sittingOut: boolean
    region: RegionQuestion | undefined
    fact: Fact | undefined
  }
): VrView {
  const question = (view.round ?? view.reveal)!.question
  const me = view.players.find((p) => p.id === view.you.id)
  const flag = question.flag ?? region?.countryFlag
  const at = view.round ?? view.reveal!
  const connection = connectionText(conn)
  const reveal = view.reveal
  const more = [
    ...(view.you.watching ? [takeSeat(conn, view, "Play from the next question")] : []),
    ...hostActions(conn, view, view.phase === "reveal" ? revealShown.value : vrPicked.value),
    ...(view.you.isHost && !(reveal && reveal.index + 1 >= reveal.total)
      ? [{ label: "End game", confirm: "Press again to end the game", press: () => conn.end() }]
      : []),
    { label: "Leave game", confirm: "Press again to leave", press: () => navigate("/") }
  ]
  const round = {
    paint,
    prompt: question.prompt,
    heading: `ROUND ${at.index + 1} OF ${at.total}`,
    mode: answerModeText(question),
    table: {
      title: "Players",
      rows: view.players
        .filter((p) => !p.watching)
        .sort((a, b) => a.rank - b.rank)
        .map((p) => ({
          colour: colourCss(p.colour),
          name: `${p.name}${p.id === view.you.id ? " (you)" : ""}`,
          detail: !p.connected ? "away" : p.locked ? "done" : "guessing",
          total: Math.round(p.score).toLocaleString(),
          ...pickable(view, p)
        })),
      hint: view.you.isHost ? "Point at a player to remove them or make them host." : undefined
    },
    detail: view.config.mapDetail,
    picture: vrPicture(question.image ?? reveal?.photo, flag, reveal && { place: reveal.label, text: fact?.text }),
    water: question.topic === "lake" || question.topic === "sea",
    colour: me && !me.watching ? colourCss(me.colour) : undefined,
    hint: view.you.hint,
    hintsLeft: view.config.hints > 0 ? view.you.hintsLeft : ("none" as const),
    useHint: (axis: HintAxis) => conn.hint(axis),
    msLeft: view.round ? () => conn.msUntil(view.round!.deadline) : undefined,
    doneLabel: "Done",
    done: lockIn,
    unlock: view.you.locked && !timeUp ? () => conn.unlock() : undefined,
    playing: !sittingOut,
    note:
      connection ??
      (view.you.watching
        ? "You're watching this game: you'll see each answer and everyone's guesses at the reveal."
        : view.you.spectating
          ? "You joined mid-round, so you're watching this one. You'll play from the next question."
          : view.you.locked
            ? "You're done. The round ends when everyone is, or when the clock runs out."
            : undefined)
  }
  if (view.phase !== "reveal" || !reveal) return { kind: "paint", round, more }

  const byId = new Map(view.players.map((p) => [p.id, p]))
  const ready = new Set(reveal.ready)
  const present = view.players.filter((p) => p.connected && !p.watching)
  const iAmReady = view.you.id !== undefined && ready.has(view.you.id)
  const last = reveal.index + 1 >= reveal.total
  const mine = reveal.results.find((r) => r.playerId === view.you.id)
  const pts = (n: number) => `${Math.round(n).toLocaleString()} pts`
  const shown = revealShown.value
  return {
    kind: "reveal",
    round,
    more,
    reveal: {
      label: reveal.label,
      answer: region ? { outline: region.outline } : { point: reveal.answer },
      focus: reveal.answer,
      stateRound: question.topic === "state",
      fact: fact?.text,
      scoreLine: mine
        ? `${mine.paint ? "" : "Passed: "}${pts(mine.score)} this round, ${pts(me?.score ?? 0)} in all`
        : "You sat this one out",
      // Best on top, as the page draws them.
      paints: [...shownResults(reveal.results, shown)].reverse().flatMap((r) => {
        const p = byId.get(r.playerId)
        return p && r.paint ? [{ layer: PaintLayer.fromRecord(r.res, r.paint.cells), colour: colourCss(p.colour) }] : []
      }),
      table: {
        title: `Round ${reveal.index + 1} of ${reveal.total}`,
        rows: [
          { name: "Everyone", total: "", selected: shown === undefined, select: () => (revealShown.value = undefined) },
          ...revealOrder(view.players, reveal.results).map(({ p, r }) => ({
            colour: colourCss(p.colour),
            name: `${p.name}${p.id === view.you.id ? " (you)" : ""}`,
            detail: `${r ? (r.paint ? `+${Math.round(r.score)}` : "passed") : "sat out"}${ready.has(p.id) ? ", ready" : ""}`,
            total: Math.round(p.score).toLocaleString(),
            selected: shown === p.id,
            select: () => (revealShown.value = shown === p.id ? undefined : p.id)
          })),
          {
            name: "Hide paint",
            total: "",
            selected: shown === NONE,
            select: () => (revealShown.value = shown === NONE ? undefined : NONE)
          }
        ],
        hint: "Point at a player to see just their guess."
      },
      note: connection ?? `${present.filter((p) => ready.has(p.id)).length} of ${present.length} ready`,
      actions: [
        ...(view.you.watching
          ? []
          : [{ label: iAmReady ? "Waiting for the others" : "Ready", press: () => conn.ready(), enabled: !iAmReady }]),
        ...(view.you.isHost ? [{ label: last ? "Show final results" : "Next round", press: () => conn.next() }] : [])
      ],
      flags: question.flag && {
        on: allFlags.value,
        toggle: () => (allFlags.value = !allFlags.value),
        pins: borders.value && vrFlagPins(borders.value)
      }
    }
  }
}
