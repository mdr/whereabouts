import { colourCss } from "@whereabouts/shared/colours"
import type { ResultsGameView } from "@whereabouts/shared/protocol/views"
import { GameMode } from "../../../game-service/game-mode"
import { useGameService } from "../../../game-service/use-game-service"
import { Icon } from "../../../ui/icons"
import { HostTag } from "../../../ui/players/HostTag/HostTag"
import { HostWord } from "../../../ui/players/HostWord"
import { Swatch, SwatchType } from "../../../ui/players/Swatch"
import { Banner } from "../../../ui/Banner/Banner"
import { ConnectionNote, connectionText } from "../../../ui/connection/ConnectionNote/ConnectionNote"
import { formatPoints } from "../../../ui/format"
import { QUESTION_TYPE_DISPLAY_INFO } from "../../../question-types"
import { cx } from "../../../ui/cx"
import kit from "../../../ui/kit.module.css"
import { VrButton, useVrView } from "../../../ui/VrButton/VrButton"
import { navigate } from "../../../router"
import { VrViewType, type VrView } from "../../../vr/view/view"
import { Awards } from "../Awards/Awards"
import { Rounds } from "../Rounds/Rounds"
import { awardParts, typeName } from "../results-table"
import { Standings } from "../Standings/Standings"
import { resultsTestIds } from "./ResultsTestIds"
import styles from "./Results.module.css"

export const Results = ({ view }: { view: ResultsGameView }) => {
  const game = useGameService()
  const online = game.online.value
  const alone = game.mode === GameMode.PRACTICE
  const standings = view.results
  const standingById = new Map(standings.map((standing) => [standing.playerId, standing]))
  // Alone there is no one to beat, and nobody to be host over.
  const winner = alone ? undefined : standings[0]
  const host = alone ? undefined : view.players.find((player) => player.isHost)?.id
  const vrView: VrView = {
    type: VrViewType.DONE,
    summary: {
      title: alone ? "Final score" : "Final standings",
      scoreLine: alone ? formatPoints(standings[0]?.total ?? 0) : winner ? `${winner.name} wins` : "",
      table: {
        title: "Standings",
        rows: standings.map((standing, i) => ({
          colour: colourCss(standing.colour),
          name: `${i + 1}. ${standing.name}${standing.playerId === view.you.id ? " (you)" : ""}`,
          total: Math.round(standing.total).toLocaleString()
        }))
      },
      note:
        connectionText(game) ?? (view.you.isHost ? undefined : "The host can start another game with the same group."),
      actions: view.you.isHost ? [{ label: "Play again", press: () => game.again(), enabled: online }] : [],
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
          colour: QUESTION_TYPE_DISPLAY_INFO[round.type].colour,
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
            onClick={() => game.again()}
            disabled={!online}
            data-testid={resultsTestIds.playAgainButton}
          >
            <Icon name="refresh" /> Play again
          </button>
        ) : (
          <p class={kit.hint} data-testid={resultsTestIds.cannotPlayAgain}>
            <HostWord capital /> can start another game with the same group.
          </p>
        )}
        <ConnectionNote />
        {view.awards.length > 0 && <Awards awards={view.awards} byId={standingById} />}
        <Rounds rounds={view.playedRounds} standings={standings} you={view.you.id} />
        <p class={kit.hint}>
          <a href="#/">Leave</a>
        </p>
      </div>
    </div>
  )
}
