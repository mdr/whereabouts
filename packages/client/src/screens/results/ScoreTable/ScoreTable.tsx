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
            {standings.map((st) => {
              const p = byId.get(st.playerId)
              return (
                <th key={st.playerId} scope="col" class={st.playerId === you ? styles.you : undefined} title={p?.name}>
                  {p && <Swatch as="i" type={SwatchType.PLAYER} colour={p.colour} class={styles.headSwatch} />}
                  <span class={styles.playerName} data-testid={scoreTableTestIds.playerName}>
                    {p?.name ?? "?"}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rounds.map((round, r) => (
            <tr key={r} data-testid={roundsTestIds.playedRound}>
              <th class={styles.roundCell} scope="row">
                <span class={styles.what}>
                  <RoundWhat number={r + 1} round={round} />
                </span>
              </th>
              {standings.map((st) => {
                const score = st.rounds[r]?.score
                const won = score !== undefined && score === best[r]
                return (
                  <td
                    key={st.playerId}
                    class={cx(won && styles.best, st.playerId === you && styles.you)}
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
