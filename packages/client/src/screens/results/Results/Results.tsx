import { colourCss, type CssColour } from "@whereabouts/shared/colours"
import type { FinalStanding, ResultsGameView } from "@whereabouts/shared/protocol/views"
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
import styles from "./Results.module.css"

export const Results = ({ conn, view }: { conn: Connection; view: ResultsGameView }) => {
  const online = conn.online.value
  const standings = view.results
  const standingById = new Map(standings.map((standing) => [standing.playerId, standing]))
  const winner = standings[0]
  const host = view.players.find((player) => player.isHost)?.id
  const vrView: VrView = {
    type: VrViewType.DONE,
    summary: {
      title: "Final standings",
      scoreLine: winner ? `${winner.name} wins` : "",
      table: {
        title: "Standings",
        rows: standings.map((standing, i) => ({
          colour: colourCss(standing.colour),
          name: `${i + 1}. ${standing.name}${standing.playerId === view.you.id ? " (you)" : ""}`,
          total: Math.round(standing.total).toLocaleString()
        }))
      },
      note:
        connectionText(conn) ?? (view.you.isHost ? undefined : "The host can start another game with the same group."),
      actions: view.you.isHost ? [{ label: "Play again", press: () => conn.again(), enabled: online }] : [],
      board: {
        awards: view.awards.map((award) => ({
          emoji: award.emoji,
          title: award.title,
          line: awardParts(
            award.line,
            award.playerIds.map((id) => standingById.get(id))
          )
        })),
        players: standings.map((standing) => ({ name: standing.name, colour: colourCss(standing.colour) })),
        rounds: view.playedRounds.map((round, roundIndex) => ({
          label: round.label,
          type: typeName(round),
          colour: QUESTION_TYPE_LOOKS[round.type].colour,
          scores: standings.map((standing) => standing.rounds[roundIndex]?.score)
        }))
      }
    },
    more: [{ label: "Leave", press: () => navigate("/") }]
  }
  useVrView(vrView)
  return (
    <div class={kit.page}>
      <div class={cx(kit.pageCard, styles.card)} data-testid={resultsTestIds.page}>
        <Banner />
        {winner && (
          <p class={kit.tagline} data-testid={resultsTestIds.winner}>
            <Swatch type={SwatchType.PLAYER} colour={winner.colour} /> <b>{winner.name}</b>
            {winner.playerId === host && <HostTag />} wins
          </p>
        )}
        <Standings standings={standings} host={host} you={view.you.id} />
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
        {view.awards.length > 0 && <Awards awards={view.awards} byId={standingById} />}
        <Rounds rounds={view.playedRounds} standings={standings} you={view.you.id} />
        <p class={kit.hint}>
          <a href="#/">Leave</a>
        </p>
      </div>
    </div>
  )
}

/** An award's line in pieces, each player's name in their colour. */
const awardParts = (line: string, standings: (FinalStanding | undefined)[]): { text: string; colour?: CssColour }[] =>
  line
    .split(/(\{\d\})/)
    .filter((part) => part !== "")
    .map((part) => {
      const match = /^\{(\d)\}$/.exec(part)
      if (!match) return { text: part }
      const standing = standings[Number(match[1])]
      // Awards and standings come from the same finalists, so a standing is always found.
      return { text: standing?.name ?? "Someone", colour: standing ? colourCss(standing.colour) : undefined }
    })
