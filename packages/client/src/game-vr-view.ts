/** A game's round or its reveal as the headset shows it. */
import { colourCss } from "@whereabouts/shared/colours"
import type { Fact } from "@whereabouts/shared/facts"
import type { HintAxis } from "@whereabouts/shared/hints"
import type { Borders, PaintedCountry } from "@whereabouts/shared/borders"
import type { Outline } from "@whereabouts/shared/questions"
import { Phase, type GameView, type PlayerView, type RevealView } from "@whereabouts/shared/protocol"
import type { Connection } from "./net"
import type { PaintController } from "./paint-controller"
import { connectionText } from "./ui/ConnectionNote"
import { navigate } from "./router"
import { canUnlock } from "./editing"
import { revealedFromView, revealShown, shownResults } from "./reveal"
import { ShownRowType, canEndGame, revealModel, roundNote, type RevealModel, type ShownRow } from "./round-model"
import { WAITING_FOR_OTHERS, noteText, readyCountText, roundScoreText } from "./round-words"
import { askedToWatch } from "./settings"
import { paintsOf } from "./reveal-paint"
import { hostActions, pickable, takeSeat, vrPicked } from "./vr-actions"
import { vrReveal, vrRound, type VrRoundShown } from "./vr-round"
import { HintAllowance, VrViewType, type VrAction, type VrReveal, type VrRound, type VrView } from "./vr/view"
import type { VrTable } from "./vr/scores"

const named = (view: GameView, p: { id: string; name: string }) => `${p.name}${p.id === view.you.id ? " (you)" : ""}`

function shownRow(view: GameView, row: ShownRow): VrTable["rows"][number] {
  const select = () => (revealShown.value = row.pick)
  if (row.type === ShownRowType.EVERYONE) return { name: "Everyone", total: "", selected: row.selected, select }
  if (row.type === ShownRowType.HIDE_PAINT) return { name: "Hide paint", total: "", selected: row.selected, select }
  const { player: p, result: r } = row
  const played = `${roundScoreText(r)}${r && !r.paint ? " passed" : ""}`
  return {
    colour: colourCss(p.colour),
    name: named(view, p),
    detail: `${played}${r?.hint ? ", hint" : ""}${row.ready ? ", ready" : ""}`,
    total: Math.round(p.score).toLocaleString(),
    selected: row.selected,
    select
  }
}

interface GameVrShown {
  lockIn: () => void
  timeUp: boolean
  outline: Outline | undefined
  fact: Fact | undefined
  painted: PaintedCountry | undefined
  borders: Borders | undefined
}

const you = (view: GameView) => view.players.find((p) => p.id === view.you.id)

function moreActions(view: GameView, conn: Connection): VrAction[] {
  return [
    ...(view.you.watching ? [takeSeat(conn, view, "Play from the next question")] : []),
    ...hostActions(conn, view, view.phase === Phase.REVEAL ? revealShown.value : vrPicked.value),
    ...(canEndGame(view)
      ? [{ label: "End game", confirm: "Press again to end the game", press: () => conn.end() }]
      : []),
    { label: "Leave game", confirm: "Press again to leave", press: () => navigate("/") }
  ]
}

function playerState(p: PlayerView): string {
  if (!p.connected) return "away"
  if (p.locked) return "done"
  return "guessing"
}

function playersTable(view: GameView): VrTable {
  return {
    title: "Players",
    rows: view.players
      .filter((p) => !p.watching)
      .sort((a, b) => a.rank - b.rank)
      .map((p) => ({
        colour: colourCss(p.colour),
        name: named(view, p),
        detail: playerState(p),
        total: Math.round(p.score).toLocaleString(),
        ...pickable(view, p)
      })),
    hint: view.you.isHost ? "Point at a player to remove them or make them host." : undefined
  }
}

function gameRound(
  view: GameView,
  conn: Connection,
  paint: PaintController,
  shown: VrRoundShown,
  connection: string | undefined,
  { lockIn, timeUp }: Pick<GameVrShown, "lockIn" | "timeUp">
): VrRound {
  const at = (view.round ?? view.reveal)!
  const me = you(view)
  const note = roundNote(view.you)
  return vrRound(shown, {
    paint,
    heading: `ROUND ${at.index + 1} OF ${at.total}`,
    table: playersTable(view),
    detail: view.config.mapDetail,
    colour: me && !me.watching ? colourCss(me.colour) : undefined,
    hint: view.you.hint,
    hintsLeft: view.config.hints > 0 ? view.you.hintsLeft : HintAllowance.NONE,
    useHint: (axis: HintAxis) => conn.hint(axis),
    timeLeft: view.round ? () => conn.timeUntil(view.round!.deadline) : undefined,
    doneLabel: "Done",
    done: lockIn,
    unlock: canUnlock(view, timeUp) ? () => conn.unlock() : undefined,
    playing: !view.you.sittingOut,
    note:
      connection ?? (note && noteText(note, { askedToWatch: askedToWatch.value, canUnlock: canUnlock(view, timeUp) }))
  })
}

function revealActions(model: RevealModel, conn: Connection): VrAction[] {
  const actions: VrAction[] = []
  if (model.ready) {
    actions.push({
      label: model.ready.done ? WAITING_FOR_OTHERS : "Ready",
      press: () => conn.ready(),
      enabled: !model.ready.done && conn.online.value
    })
  }
  if (model.next) actions.push({ label: model.next.label, press: () => conn.next(), enabled: conn.online.value })
  return actions
}

function gameReveal(
  view: GameView,
  reveal: RevealView,
  conn: Connection,
  shown: VrRoundShown,
  connection: string | undefined,
  { outline, painted, borders }: Pick<GameVrShown, "outline" | "painted" | "borders">
): VrReveal {
  const whose = revealShown.value
  const model = revealModel(view, reveal, whose)
  const mine = reveal.results.find((r) => r.playerId === view.you.id)
  const score = mine && { score: mine.score, passed: !mine.paint, total: you(view)?.score ?? 0, painted }
  return vrReveal(shown, revealedFromView(reveal, outline), score, borders, {
    paints: paintsOf(shownResults(reveal.results, whose), view.players),
    table: {
      title: `Round ${reveal.index + 1} of ${reveal.total}`,
      rows: model.rows.map((row) => shownRow(view, row)),
      hint: "Point at a player to see just their guess."
    },
    note: connection ?? readyCountText(model.readyCount, model.presentCount),
    actions: revealActions(model, conn)
  })
}

export function gameVrView(view: GameView, conn: Connection, paint: PaintController, s: GameVrShown): VrView {
  const connection = connectionText(conn)
  const reveal = view.reveal
  const shown: VrRoundShown = {
    question: (view.round ?? view.reveal)!.question,
    revealed: reveal && revealedFromView(reveal, s.outline),
    fact: s.fact
  }
  const round = gameRound(view, conn, paint, shown, connection, s)
  const more = moreActions(view, conn)
  if (view.phase !== Phase.REVEAL || !reveal) return { type: VrViewType.PAINT, round, more }
  return { type: VrViewType.REVEAL, round, more, reveal: gameReveal(view, reveal, conn, shown, connection, s) }
}
