/** A game's round or its reveal as the headset shows it. */
import { colourCss } from "@whereabouts/shared/colours"
import type { Fact } from "@whereabouts/shared/facts"
import type { HintAxis } from "@whereabouts/shared/hints"
import type { Borders, PaintedCountry } from "@whereabouts/shared/borders"
import type { Outline } from "@whereabouts/shared/questions"
import { Phase, type GameView } from "@whereabouts/shared/protocol"
import type { Connection } from "./net"
import type { PaintController } from "./paint-controller"
import { connectionText } from "./ui/ConnectionNote"
import { navigate } from "./router"
import { canUnlock } from "./editing"
import { revealedFromView, revealShown, shownResults } from "./reveal"
import { RoundNote, ShownRowType, canEndGame, revealModel, roundNote, type ShownRow } from "./round-model"
import { paintsOf } from "./reveal-paint"
import { hostActions, pickable, takeSeat, vrPicked } from "./vr-actions"
import { vrReveal, vrRound, type VrRoundShown } from "./vr-round"
import { HintAllowance, VrViewType, type VrView } from "./vr/view"
import type { VrTable } from "./vr/scores"

const NOTES: Record<RoundNote, string> = {
  [RoundNote.WATCHING]: "You're watching this game: you'll see each answer and everyone's guesses at the reveal.",
  [RoundNote.JOINED_LATE]: "You joined mid-round, so you're watching this one. You'll play from the next question.",
  [RoundNote.DONE]: "You're done. The round ends when everyone is, or when the clock runs out."
}

const named = (view: GameView, p: { id: string; name: string }) => `${p.name}${p.id === view.you.id ? " (you)" : ""}`

function shownRow(view: GameView, row: ShownRow): VrTable["rows"][number] {
  const select = () => (revealShown.value = row.pick)
  if (row.type === ShownRowType.EVERYONE) return { name: "Everyone", total: "", selected: row.selected, select }
  if (row.type === ShownRowType.HIDE_PAINT) return { name: "Hide paint", total: "", selected: row.selected, select }
  const { player: p, result: r } = row
  const played = r ? (r.paint ? `+${Math.round(r.score)}` : "passed") : "sat out"
  return {
    colour: colourCss(p.colour),
    name: named(view, p),
    detail: `${played}${r?.hint ? ", hint" : ""}${row.ready ? ", ready" : ""}`,
    total: Math.round(p.score).toLocaleString(),
    selected: row.selected,
    select
  }
}

export function gameVrView(
  view: GameView,
  conn: Connection,
  paint: PaintController,
  {
    lockIn,
    timeUp,
    outline,
    fact,
    painted,
    borders
  }: {
    lockIn: () => void
    timeUp: boolean
    outline: Outline | undefined
    fact: Fact | undefined
    painted: PaintedCountry | undefined
    borders: Borders | undefined
  }
): VrView {
  const at = (view.round ?? view.reveal)!
  const me = view.players.find((p) => p.id === view.you.id)
  const connection = connectionText(conn)
  const reveal = view.reveal
  const shown: VrRoundShown = {
    question: at.question,
    revealed: reveal && revealedFromView(reveal, outline),
    fact
  }
  const note = roundNote(view.you)
  const more = [
    ...(view.you.watching ? [takeSeat(conn, view, "Play from the next question")] : []),
    ...hostActions(conn, view, view.phase === Phase.REVEAL ? revealShown.value : vrPicked.value),
    ...(canEndGame(view)
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
          name: named(view, p),
          detail: !p.connected ? "away" : p.locked ? "done" : "guessing",
          total: Math.round(p.score).toLocaleString(),
          ...pickable(view, p)
        })),
      hint: view.you.isHost ? "Point at a player to remove them or make them host." : undefined
    },
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
    note: connection ?? (note && NOTES[note])
  })
  if (view.phase !== Phase.REVEAL || !reveal) return { type: VrViewType.PAINT, round, more }

  const whose = revealShown.value
  const model = revealModel(view, reveal, whose)
  const mine = reveal.results.find((r) => r.playerId === view.you.id)
  const you = mine && { score: mine.score, passed: !mine.paint, total: me?.score ?? 0, painted }
  return {
    type: VrViewType.REVEAL,
    round,
    more,
    reveal: vrReveal(shown, revealedFromView(reveal, outline), you, borders, {
      paints: paintsOf(shownResults(reveal.results, whose), view.players),
      table: {
        title: `Round ${reveal.index + 1} of ${reveal.total}`,
        rows: model.rows.map((row) => shownRow(view, row)),
        hint: "Point at a player to see just their guess."
      },
      note: connection ?? `${model.readyCount} of ${model.presentCount} ready`,
      actions: [
        ...(model.ready
          ? [
              {
                label: model.ready.done ? "Waiting for the others" : "Ready",
                press: () => conn.ready(),
                enabled: !model.ready.done
              }
            ]
          : []),
        ...(model.next ? [{ label: model.next.label, press: () => conn.next() }] : [])
      ]
    })
  }
}
