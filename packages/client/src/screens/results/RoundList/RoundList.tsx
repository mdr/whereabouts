import type { PlayerId } from "@whereabouts/shared/ids"
import type { Points } from "@whereabouts/shared/units"
import type { FinalStanding, PlayedRound } from "@whereabouts/shared/protocol/views"
import { cx } from "../../../ui/cx"
import { Swatch, SwatchType } from "../../../ui/players/Swatch"
import { RoundWhat } from "../RoundWhat/RoundWhat"
import { roundListTestIds } from "./RoundListTestIds"
import { roundsTestIds } from "../Rounds/RoundsTestIds"
import styles from "./RoundList.module.css"

export interface RoundListProps {
  rounds: PlayedRound[]
  standings: FinalStanding[]
  you: PlayerId
  best: Points[]
}

/** A line per round: what it asked, who won it (and how many tied), and your score. */
export const RoundList = ({ rounds, standings, you, best }: RoundListProps) => {
  const mine = standings.find((standing) => standing.playerId === you)
  return (
    <ol class={styles.list}>
      <li class={styles.head} aria-hidden="true">
        <span class={styles.text} />
        <span>Best</span>
        {mine && <span class={styles.yours}>You</span>}
      </li>
      {rounds.map((round, roundIndex) => {
        const winners = standings.filter((standing) => standing.rounds[roundIndex]?.score === best[roundIndex])
        const first = winners[0]
        const yours = mine?.rounds[roundIndex]?.score
        return (
          <li key={roundIndex} data-testid={roundsTestIds.playedRound}>
            <RoundWhat number={roundIndex + 1} round={round} textClass={styles.text} />
            {first && (
              <span
                class={styles.winner}
                data-testid={roundListTestIds.roundWinner}
                title={`Won by ${winners.map((winner) => winner.name).join(", ")}`}
              >
                <Swatch as="i" type={SwatchType.PLAYER} colour={first.colour} />
                <span class={styles.winnerName}>{first.name}</span>
                {winners.length > 1 && <span class={styles.tied}>+{winners.length - 1}</span>}
                <b>{Math.round(best[roundIndex]!)}</b>
              </span>
            )}
            {mine && (
              <span
                class={cx(styles.yours, yours !== undefined && yours === best[roundIndex] && styles.best)}
                title="Your score"
                data-testid={roundListTestIds.roundYours}
              >
                {yours === undefined ? "–" : Math.round(yours)}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
