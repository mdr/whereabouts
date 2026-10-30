import { useEffect, useMemo, useRef, useState } from "preact/hooks"
import { PaintLayer, compactRecord } from "@whereabouts/shared/paint"
import { colourCss } from "@whereabouts/shared/colours"
import type { Fact } from "@whereabouts/shared/facts"
import type { GameView } from "@whereabouts/shared/protocol"
import type { HintAxis } from "@whereabouts/shared/hints"
import type { PaintedCountry } from "@whereabouts/shared/borders"
import type { RegionQuestion } from "@whereabouts/shared/regions"
import { isWater } from "@whereabouts/shared/questions"
import type { Connection } from "../net"
import { usePaint } from "../ui/MapView"
import { Card } from "../ui/bits"
import { Countdown, Hud, HudHeader, HudRight, HudTop, toolbarGrow } from "../ui/Hud"
import kit from "../ui/kit.module.css"
import { DoneButton, RoundPrompt } from "../ui/Round"
import { hostActions, pickable, takeSeat, vrPicked } from "../vr-actions"
import { navigate } from "../router"
import { PaintDev, PaintTools } from "../ui/PaintTools"
import { PlayerList } from "../ui/PlayerList"
import { ConnectionNote, connectionText } from "../ui/ConnectionNote"
import { DevDrawer } from "../ui/DevDrawer"
import { ConnectionDev } from "../ui/ConnectionDev"
import { NONE, Reveal, revealedAnswer, revealOrder, revealShown, shownResults } from "./Reveal"
import { borders, loadBorders } from "../borders"
import { Icon } from "../ui/icons"
import { PlayersPanel, playersPanelOpen } from "../ui/PlayersPanel"
import { EndGameButton } from "../ui/HostControls"
import { kickRequest, makeHostRequest, useConfirm } from "../ui/ConfirmDialog"
import { askedToWatch } from "../settings"
import { TakeSeatButton } from "../ui/TakeSeat"
import { HintCard } from "../ui/Hint"
import { loadRegions, useRegion } from "../regions"
import { VrButton, useVrView } from "../ui/VrButton"
import { mainCountry } from "../ui/FlagReveal"
import type { VrView } from "../vr"
import type { PaintController } from "../paint-controller"
import { inGameTestIds } from "./InGameTestIds"
import { useFact } from "../facts"
import { paintLayer, paintsOf } from "../reveal-paint"
import { announcePass, useRoundMap } from "../round"
import { vrReveal, vrRound, type VrRoundShown } from "../vr-round"

export function InGame({ conn, view }: { conn: Connection; view: GameView }) {
  const paint = usePaint()
  // Not painting this round: a spectator, or a late joiner sitting one out.
  const sittingOut = view.you.watching || view.you.spectating
  const roundKey = view.round?.index ?? view.reveal?.index ?? -1
  const guessing = view.phase === "guessing"
  const question = view.round?.question ?? view.reveal?.question
  const sendTimer = useRef<number | undefined>(undefined)
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

  useRoundMap(paint, {
    round: roundKey,
    painting: guessing && view.round !== undefined,
    question,
    detail: view.config.mapDetail,
    reveal: view.phase === "reveal",
    hint: view.you.hint,
    start: () => {
      // After a reconnect the server hands back what we had painted.
      const saved = view.you.paint
      if (saved) {
        paint.layer = PaintLayer.fromRecord(paint.layer.res, saved.cells)
        paint.floor.value = saved.floor
        paint.version.value++
      }
      // Paint in your own colour, the same one others see at the reveal.
      const me = view.players.find((p) => p.id === view.you.id)
      paint.showOwn(me && !me.watching ? colourCss(me.colour) : undefined)
    }
  })

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

  // Uploads made while the connection was down were lost. Once the server
  // has us back (its first state since), send the paint again.
  const status = conn.status.value
  const resend = useRef(false)
  useEffect(() => {
    if (status !== "connected") resend.current = true
  }, [status])
  useEffect(() => {
    if (!resend.current || status !== "connected") return
    resend.current = false
    if (guessing && !sittingOut && !view.you.locked && !timeUp) sendNow()
  }, [view])

  // Done with paint freezes it; Done with nothing painted is a pass, which
  // scores PASS_SCORE and lets the round end without waiting on you.
  function lockIn() {
    announcePass(paint)
    sendNow()
    conn.lock()
  }

  // A country round shows the country's flag beside its name, once the outlines have loaded.
  const region = useRegion(question?.regionId)

  // The room's code, so everyone in the game sees the same one.
  const fact = useFact(view.reveal?.wiki, view.code, view.reveal?.index ?? 0)

  const mine = view.reveal?.results.find((r) => r.playerId === view.you.id)
  const painted = useMemo(
    () =>
      view.reveal?.question.flag && borders.value && mine?.paint
        ? mainCountry(borders.value, paintLayer(mine.res, mine.paint).toCells())
        : undefined,
    [borders.value, view.reveal?.index, mine?.paint !== undefined]
  )
  const vrView = gameVrView(view, conn, paint, { lockIn, timeUp, sittingOut, region, fact, painted })
  useVrView(vrView, `${view.phase} ${roundKey}`)

  if (view.phase === "reveal" && view.reveal) {
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
            right={<Countdown msRemaining={() => conn.msUntil(round.deadline)} />}
          />
          <RoundPrompt question={round.question} countryFlag={region?.countryFlag} />
          {!sittingOut && view.config.hints > 0 && (
            <HintCard band={view.you.hint} left={view.you.hintsLeft} onUse={(axis) => conn.hint(axis)} />
          )}
          <ConnectionNote conn={conn} />
          {view.you.watching && (
            <Card>
              <p class={kit.hint}>
                {askedToWatch.value
                  ? "You're watching this game. You'll see each answer and everyone's guesses at the reveal."
                  : "The game was full, so you're watching. You'll see each answer and everyone's guesses at the reveal."}
              </p>
              <TakeSeatButton conn={conn} view={view} inCard />
            </Card>
          )}
          {view.you.spectating && (
            <Card>
              <p class={kit.hint} data-testid={inGameTestIds.sittingOutNote}>
                You joined mid-round, so you're watching this one. You'll play from the next question.
              </p>
            </Card>
          )}
          {view.you.locked && (
            <Card>
              <p class={kit.hint} data-testid={inGameTestIds.doneNote}>
                You're done. The round ends when everyone is, or when the clock runs out. Changed your mind? Keep
                editing.
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
          {view.you.isHost && (
            <EndGameButton
              onEnd={() => conn.end()}
              title="Score this round as it stands and show the final standings"
              besidePlayers
            />
          )}
        </HudRight>
        {!sittingOut && (
          <PaintTools water={isWater(round.question.topic)} hint={view.you.hint}>
            {view.you.locked ? (
              <button
                class={toolbarGrow}
                title="Take back Done and change your guess"
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
    fact,
    painted
  }: {
    lockIn: () => void
    timeUp: boolean
    sittingOut: boolean
    region: RegionQuestion | undefined
    fact: Fact | undefined
    painted: PaintedCountry | undefined
  }
): VrView {
  const question = (view.round ?? view.reveal)!.question
  const me = view.players.find((p) => p.id === view.you.id)
  const at = view.round ?? view.reveal!
  const connection = connectionText(conn)
  const reveal = view.reveal
  const shown: VrRoundShown = {
    question,
    countryFlag: region?.countryFlag,
    revealed: reveal && revealedAnswer(reveal, region),
    fact
  }
  const more = [
    ...(view.you.watching ? [takeSeat(conn, view, "Play from the next question")] : []),
    ...hostActions(conn, view, view.phase === "reveal" ? revealShown.value : vrPicked.value),
    ...(view.you.isHost && !(reveal && reveal.index + 1 >= reveal.total)
      ? [{ label: "End game", confirm: "Press again to end the game", press: () => conn.end() }]
      : []),
    { label: "Leave game", confirm: "Press again to leave", press: () => navigate("/") }
  ]
  const round = vrRound(shown, {
    paint,
    heading: `ROUND ${at.index + 1} OF ${at.total}`,
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
  })
  if (view.phase !== "reveal" || !reveal) return { kind: "paint", round, more }

  const ready = new Set(reveal.ready)
  const present = view.players.filter((p) => p.connected && !p.watching)
  const iAmReady = view.you.id !== undefined && ready.has(view.you.id)
  const last = reveal.index + 1 >= reveal.total
  const mine = reveal.results.find((r) => r.playerId === view.you.id)
  const whose = revealShown.value
  const you = mine && { score: mine.score, passed: !mine.paint, total: me?.score ?? 0, painted }
  return {
    kind: "reveal",
    round,
    more,
    reveal: vrReveal(shown, revealedAnswer(reveal, region), you, borders.value, {
      paints: paintsOf(shownResults(reveal.results, whose), view.players),
      table: {
        title: `Round ${reveal.index + 1} of ${reveal.total}`,
        rows: [
          { name: "Everyone", total: "", selected: whose === undefined, select: () => (revealShown.value = undefined) },
          ...revealOrder(view.players, reveal.results).map(({ p, r }) => ({
            colour: colourCss(p.colour),
            name: `${p.name}${p.id === view.you.id ? " (you)" : ""}`,
            detail: `${r ? (r.paint ? `+${Math.round(r.score)}` : "passed") : "sat out"}${r?.hint ? ", hint" : ""}${ready.has(p.id) ? ", ready" : ""}`,
            total: Math.round(p.score).toLocaleString(),
            selected: whose === p.id,
            select: () => (revealShown.value = whose === p.id ? undefined : p.id)
          })),
          {
            name: "Hide paint",
            total: "",
            selected: whose === NONE,
            select: () => (revealShown.value = whose === NONE ? undefined : NONE)
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
      ]
    })
  }
}
