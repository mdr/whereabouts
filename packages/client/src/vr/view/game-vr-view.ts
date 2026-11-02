/** A game's round or its reveal as the headset shows it. */
import { colourCss } from "@whereabouts/shared/colours"
import type { Fact } from "@whereabouts/shared/catalogue/facts"
import type { HintAxis } from "@whereabouts/shared/hints"
import type { Borders, PaintedCountry } from "@whereabouts/shared/borders"
import type { Outlines } from "@whereabouts/shared/questions"
import {
  Phase,
  RoundGuessType,
  type GameView,
  type InPlayGameView,
  type RevealView
} from "@whereabouts/shared/protocol/views"
import { YouRoleType, type PlayingPlayerView } from "@whereabouts/shared/roles"
import type { Connection } from "../../net/net"
import type { PaintController } from "../../paint/paint-controller"
import { connectionText } from "../../ui/connection/ConnectionNote/ConnectionNote"
import { navigate } from "../../router"
import { canUnlock } from "../../round/editing"
import { revealedFromView, revealShown, shownPlayerId, shownResults } from "../../round/reveal"
import {
  ShownRowType,
  canEndGame,
  ownColour,
  revealModel,
  roundNote,
  roundOf,
  type RevealModel,
  type ShownRow
} from "../../round/round-model"
import { WAITING_FOR_OTHERS, noteText, readyCountText, roundScoreText } from "../../round/round-words"
import { askedToWatch } from "../../settings/settings"
import { paintsOf } from "../../round/reveal-paint"
import { hostActions, pickable, takeSeat, vrPicked } from "./vr-actions"
import { vrReveal, vrRound, type VrRoundShown } from "./vr-round"
import {
  HintAllowance,
  VrPaintsType,
  VrViewType,
  type VrAction,
  type VrReveal,
  type VrRound,
  type VrView
} from "./view"
import type { VrTable, VrTableRow } from "../scores/scores"

const named = (view: GameView, player: { id: string; name: string }) =>
  `${player.name}${player.id === view.you.id ? " (you)" : ""}`

const shownRow = (view: GameView, row: ShownRow): VrTableRow => {
  const select = () => (revealShown.value = row.pick)
  if (row.type === ShownRowType.EVERYONE) return { name: "Everyone", total: "", selected: row.selected, select }
  if (row.type === ShownRowType.HIDE_PAINT) return { name: "Hide paint", total: "", selected: row.selected, select }
  const { player, result } = row
  const played = `${roundScoreText(result)}${result?.guess.type === RoundGuessType.PASSED ? " passed" : ""}`
  return {
    colour: colourCss(player.colour),
    name: named(view, player),
    detail: `${played}${result?.hint ? ", hint" : ""}${row.ready ? ", ready" : ""}`,
    total: Math.round(player.score).toLocaleString(),
    selected: row.selected,
    select
  }
}

interface GameVrShown {
  lockIn: () => void
  timeUp: boolean
  outlines: Outlines | undefined
  fact: Fact | undefined
  painted: PaintedCountry | undefined
  borders: Borders | undefined
}

const moreActions = (view: GameView, conn: Connection): VrAction[] => [
  ...(view.you.role.type === YouRoleType.SPECTATOR ? [takeSeat(conn, view, "Play from the next question")] : []),
  ...hostActions(conn, view, view.phase === Phase.REVEAL ? shownPlayerId(revealShown.value) : vrPicked.value),
  ...(canEndGame(view)
    ? [
        {
          label: "End game",
          confirm: "Press again to end the game",
          press: () => conn.end(),
          enabled: conn.online.value
        }
      ]
    : []),
  { label: "Leave game", confirm: "Press again to leave", press: () => navigate("/") }
]

const playerState = (player: PlayingPlayerView): string => {
  if (!player.connected) return "away"
  if (player.locked) return "done"
  return "guessing"
}

const playersTable = (view: GameView): VrTable => ({
  title: "Players",
  rows: [...view.players]
    .sort((a, b) => a.rank - b.rank)
    .map((player) => ({
      colour: colourCss(player.colour),
      name: named(view, player),
      detail: playerState(player),
      total: Math.round(player.score).toLocaleString(),
      ...pickable(view, player)
    })),
  hint: view.you.isHost ? "Point at a player to remove them or make them host." : undefined
})

const gameRound = (
  view: InPlayGameView,
  conn: Connection,
  paint: PaintController,
  shown: VrRoundShown,
  connection: string | undefined,
  { lockIn, timeUp }: Pick<GameVrShown, "lockIn" | "timeUp">
): VrRound => {
  const at = roundOf(view)
  const { role } = view.you
  const note = roundNote(view.you)
  const deadline = view.phase === Phase.GUESSING ? view.round.deadline : undefined
  return vrRound(shown, {
    paint,
    heading: `ROUND ${at.index + 1} OF ${at.total}`,
    table: playersTable(view),
    detail: view.config.mapDetail,
    colour: ownColour(view.you),
    hint: view.you.hint,
    hintsLeft: view.config.hints > 0 && role.type === YouRoleType.PLAYING ? role.hintsLeft : HintAllowance.NONE,
    useHint: (axis: HintAxis) => conn.hint(axis),
    timeLeft: deadline === undefined ? undefined : () => conn.timeUntil(deadline),
    doneLabel: "Done",
    done: lockIn,
    unlock: canUnlock(view, timeUp) ? () => conn.unlock() : undefined,
    playing: role.type === YouRoleType.PLAYING,
    note:
      connection ?? (note && noteText(note, { askedToWatch: askedToWatch.value, canUnlock: canUnlock(view, timeUp) }))
  })
}

const revealActions = (model: RevealModel, conn: Connection): VrAction[] => {
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

const gameReveal = (
  view: GameView,
  reveal: RevealView,
  conn: Connection,
  shown: VrRoundShown,
  connection: string | undefined,
  { outlines, painted, borders }: Pick<GameVrShown, "outlines" | "painted" | "borders">
): VrReveal => {
  const whose = revealShown.value
  const model = revealModel(view, reveal, whose)
  const mine = reveal.results.find((result) => result.playerId === view.you.id)
  const score = mine && {
    score: mine.score,
    passed: mine.guess.type === RoundGuessType.PASSED,
    total: view.players.find((player) => player.id === view.you.id)?.score ?? 0,
    painted
  }
  return vrReveal(shown, revealedFromView(reveal, outlines), score, borders, {
    paints: { type: VrPaintsType.PLAYERS, paints: paintsOf(shownResults(reveal.results, whose)) },
    table: {
      title: `Round ${reveal.index + 1} of ${reveal.total}`,
      rows: model.rows.map((row) => shownRow(view, row)),
      hint: "Point at a player to see just their guess."
    },
    note: connection ?? readyCountText(model.readyCount, model.presentCount),
    actions: revealActions(model, conn)
  })
}

export const gameVrView = (
  view: InPlayGameView,
  conn: Connection,
  paint: PaintController,
  pageShown: GameVrShown
): VrView => {
  const connection = connectionText(conn)
  const reveal = view.phase === Phase.REVEAL ? view.reveal : undefined
  const shown: VrRoundShown = {
    question: roundOf(view).question,
    revealed: reveal && revealedFromView(reveal, pageShown.outlines),
    fact: pageShown.fact
  }
  const round = gameRound(view, conn, paint, shown, connection, pageShown)
  const more = moreActions(view, conn)
  if (view.phase !== Phase.REVEAL) return { type: VrViewType.PAINT, round, more }
  return {
    type: VrViewType.REVEAL,
    round,
    more,
    reveal: gameReveal(view, view.reveal, conn, shown, connection, pageShown)
  }
}
