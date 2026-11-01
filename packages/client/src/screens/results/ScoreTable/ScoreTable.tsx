import { cx } from "../../../ui/cx"
import { Swatch, SwatchType } from "../../../ui/players/Swatch"
import { RoundWhat } from "../RoundWhat/RoundWhat"
import type { RoundListProps } from "../RoundList/RoundList"
import { roundsTestIds } from "../Rounds/RoundsTestIds"
import { scoreTableTestIds } from "./ScoreTableTestIds"
import styles from "./ScoreTable.module.css"

/**
 * Every round's score for every player: a row per round, saying what it
 * asked, and a column per player in finishing order, each round's best
 * picked out. Many players scroll sideways, the rounds staying in view.
 */
export function ScoreTable({ rounds, standings, byId, you, best, scrolls }: RoundListProps & { scrolls: boolean }) {
  return (
    <div class={cx(styles.scroll, scrolls && styles.scrolls)}>
      <table class={styles.table} data-testid={scoreTableTestIds.table}>
        <thead>
          <tr>
            <th class={styles.roundCell} scope="col">
              <span class="sr-only">Round</span>
            </th>
            {standings.map((standing) => {
              const player = byId.get(standing.playerId)
              return (
                <th
                  key={standing.playerId}
                  scope="col"
                  class={standing.playerId === you ? styles.you : undefined}
                  title={player?.name}
                >
                  {player && (
                    <Swatch as="i" type={SwatchType.PLAYER} colour={player.colour} class={styles.headSwatch} />
                  )}
                  <span class={styles.playerName} data-testid={scoreTableTestIds.playerName}>
                    {player?.name ?? "?"}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rounds.map((round, roundIndex) => (
            <tr key={roundIndex} data-testid={roundsTestIds.playedRound}>
              <th class={styles.roundCell} scope="row">
                <span class={styles.what}>
                  <RoundWhat number={roundIndex + 1} round={round} />
                </span>
              </th>
              {standings.map((standing) => {
                const score = standing.rounds[roundIndex]?.score
                const won = score !== undefined && score === best[roundIndex]
                return (
                  <td
                    key={standing.playerId}
                    class={cx(won && styles.best, standing.playerId === you && styles.you)}
                    title={score === undefined ? "Sat out" : won ? "Won the round" : undefined}
                  >
                    {score === undefined ? "–" : Math.round(score)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
