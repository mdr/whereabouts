import { cx } from "../../ui/cx"
import { Swatch, SwatchType } from "../../ui/players/PlayerList"
import { RoundWhat } from "./RoundWhat"
import type { RoundListProps } from "./RoundList"
import { roundsTestIds } from "./RoundsTestIds"
import { scoreTableTestIds } from "./ScoreTableTestIds"
import s from "./ScoreTable.module.css"

/**
 * Every round's score for every player: a row per round, saying what it
 * asked, and a column per player in finishing order, each round's best
 * picked out. Many players scroll sideways, the rounds staying in view.
 */
export function ScoreTable({
  rounds,
  standings,
  byId,
  you,
  best,
  scrolls
}: RoundListProps & { scrolls: boolean }) {
  return (
    <div class={cx(s.scroll, scrolls && s.scrolls)}>
      <table class={s.table} data-testid={scoreTableTestIds.table}>
        <thead>
          <tr>
            <th class={s.roundCell} scope="col">
              <span class="sr-only">Round</span>
            </th>
            {standings.map((st) => {
              const p = byId.get(st.playerId)
              return (
                <th key={st.playerId} scope="col" class={st.playerId === you ? s.you : undefined} title={p?.name}>
                  <Swatch as="i" type={SwatchType.PLAYER} colour={p?.colour} class={s.headSwatch} />
                  <span class={s.playerName} data-testid={scoreTableTestIds.playerName}>
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
              <th class={s.roundCell} scope="row">
                <span class={s.what}>
                  <RoundWhat number={r + 1} round={round} />
                </span>
              </th>
              {standings.map((st) => {
                const score = st.rounds[r]?.score
                const won = score !== undefined && score === best[r]
                return (
                  <td
                    key={st.playerId}
                    class={cx(won && s.best, st.playerId === you && s.you)}
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
