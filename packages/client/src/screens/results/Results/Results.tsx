import type { CssColour } from "@whereabouts/shared/colours"
import { colourCss } from "@whereabouts/shared/colours"
import type { ResultsGameView } from "@whereabouts/shared/protocol"
import type { PlayingPlayerView } from "@whereabouts/shared/roles"
import type { Connection } from "../../../net/net"
import { Icon } from "../../../ui/icons"
import { HostTag } from "../../../ui/players/HostTag/HostTag"
import { HostWord } from "../../../ui/players/HostWord"
import { Swatch, SwatchType } from "../../../ui/players/Swatch"
import { Banner } from "../../../ui/Banner/Banner"
import { ConnectionNote, connectionText } from "../../../ui/connection/ConnectionNote/ConnectionNote"
import { QUESTION_TYPE_LOOKS } from "../../../question-types"
import { cx } from "../../../ui/cx"
import kit from "../../../ui/kit.module.css"
import { VrButton, useVrView } from "../../../ui/VrButton/VrButton"
import { navigate } from "../../../router"
import { VrViewType, type VrView } from "../../../vr/view/view"
import { Awards } from "../Awards/Awards"
import { Rounds } from "../Rounds/Rounds"
import { typeName } from "../RoundWhat/RoundWhat"
import { Standings } from "../Standings/Standings"
import { resultsTestIds } from "./ResultsTestIds"
import s from "./Results.module.css"

export function Results({ conn, view }: { conn: Connection; view: ResultsGameView }) {
  const online = conn.online.value
  const byId = new Map(view.players.map((p) => [p.id, p]))
  const standings = view.results
  const winner = standings[0] ? byId.get(standings[0].playerId) : undefined
  const vrView: VrView = {
    type: VrViewType.DONE,
    summary: {
      title: "Final standings",
      scoreLine: winner ? `${winner.name} wins` : "",
      table: {
        title: "Standings",
        rows: standings.map((s, i) => {
          const p = byId.get(s.playerId)
          return {
            colour: p && colourCss(p.colour),
            name: `${i + 1}. ${p?.name ?? "?"}${s.playerId === view.you.id ? " (you)" : ""}`,
            total: Math.round(s.total).toLocaleString()
          }
        })
      },
      note:
        connectionText(conn) ?? (view.you.isHost ? undefined : "The host can start another game with the same group."),
      actions: view.you.isHost ? [{ label: "Play again", press: () => conn.again(), enabled: online }] : [],
      board: {
        awards: view.awards.map((a) => ({
          emoji: a.emoji,
          title: a.title,
          line: awardParts(
            a.line,
            a.playerIds.map((id) => byId.get(id))
          )
        })),
        players: standings.map((s) => {
          const p = byId.get(s.playerId)
          return { name: p?.name ?? "?", colour: colourCss(p?.colour) }
        }),
        rounds: view.playedRounds.map((round, r) => ({
          label: round.label,
          type: typeName(round),
          colour: QUESTION_TYPE_LOOKS[round.type].colour,
          scores: standings.map((s) => s.rounds[r]?.score)
        }))
      }
    },
    more: [{ label: "Leave", press: () => navigate("/") }]
  }
  useVrView(vrView)
  return (
    <div class={kit.page}>
      <div class={cx(kit.pageCard, s.card)} data-testid={resultsTestIds.page}>
        <Banner />
        {winner && (
          <p class={kit.tagline} data-testid={resultsTestIds.winner}>
            <Swatch type={SwatchType.PLAYER} colour={winner.colour} /> <b>{winner.name}</b>
            {winner.isHost && <HostTag />} wins
          </p>
        )}
        <Standings standings={standings} byId={byId} you={view.you.id} />
        <VrButton view={vrView} />
        {view.you.isHost ? (
          <button
            class="primary big"
            onClick={() => conn.again()}
            disabled={!online}
            data-testid={resultsTestIds.playAgainButton}
          >
            <Icon name="refresh" /> Play again
          </button>
        ) : (
          <p class={kit.hint}>
            <HostWord capital /> can start another game with the same group.
          </p>
        )}
        <ConnectionNote conn={conn} />
        {view.awards.length > 0 && <Awards awards={view.awards} byId={byId} />}
        <Rounds rounds={view.playedRounds} standings={standings} byId={byId} you={view.you.id} />
        <p class={kit.hint}>
          <a href="#/">Leave</a>
        </p>
      </div>
    </div>
  )
}

/** An award's line in pieces, each player's name in their colour. */
function awardParts(line: string, players: (PlayingPlayerView | undefined)[]): { text: string; colour?: CssColour }[] {
  return line
    .split(/(\{\d\})/)
    .filter((part) => part !== "")
    .map((part) => {
      const m = /^\{(\d)\}$/.exec(part)
      if (!m) return { text: part }
      const p = players[Number(m[1])]
      return { text: p?.name ?? "Someone", colour: p ? colourCss(p.colour) : undefined }
    })
}
